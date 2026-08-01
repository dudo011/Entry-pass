import { Hono } from 'hono';
import legacyApp from './worker-v2.js';

const app = new Hono();

async function getUser(c) {
  const auth = c.req.header('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const session = await c.env.DB.prepare('SELECT user_id FROM sessions WHERE token = ?').bind(token).first();
  if (!session) return null;
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(session.user_id).first();
  if (user) user._token = token;
  return user;
}

async function requireAdmin(c) {
  const user = await getUser(c);
  if (!user) return { error: c.json({ error: '로그인이 필요합니다.' }, 401) };
  if (user.role !== 'staff' || user.staff_role !== 'admin') {
    return { error: c.json({ error: '관리자 권한이 필요합니다.' }, 403) };
  }
  return { user };
}

// 직원 권한 변경: approver(직원) ↔ admin(관리자)
app.post('/api/admin/staff-accounts/:id/role', async (c) => {
  const auth = await requireAdmin(c);
  if (auth.error) return auth.error;

  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const nextRole = String(body.staffRole || '');
  if (!['admin', 'approver'].includes(nextRole)) {
    return c.json({ error: '유효하지 않은 직원 권한입니다.' }, 400);
  }

  const target = await c.env.DB.prepare(
    "SELECT id, role, staff_role, login_id, name FROM users WHERE id = ? AND role = 'staff'")
    .bind(targetId).first();
  if (!target) return c.json({ error: '직원 계정을 찾을 수 없습니다.' }, 404);
  if (target.staff_role === nextRole) return c.json({ ok: true, unchanged: true });

  if (target.staff_role === 'admin' && nextRole === 'approver') {
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM users WHERE role='staff' AND staff_role='admin'").first();
    if (Number(count?.cnt || 0) <= 1) {
      return c.json({ error: '최소 1명의 관리자는 반드시 유지되어야 합니다.' }, 409);
    }
  }

  await c.env.DB.prepare('UPDATE users SET staff_role = ? WHERE id = ?')
    .bind(nextRole, targetId).run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();

  return c.json({
    ok: true,
    message: nextRole === 'admin' ? '관리자 권한을 부여했습니다.' : '직원 권한으로 변경했습니다.',
  });
});

// 직원 계정 삭제. 본인 계정과 마지막 관리자 계정은 삭제할 수 없다.
app.delete('/api/admin/staff-accounts/:id', async (c) => {
  const auth = await requireAdmin(c);
  if (auth.error) return auth.error;

  const targetId = c.req.param('id');
  if (targetId === auth.user.id) {
    return c.json({ error: '현재 로그인한 본인 계정은 삭제할 수 없습니다.' }, 400);
  }

  const target = await c.env.DB.prepare(
    "SELECT id, role, staff_role, login_id, name FROM users WHERE id = ? AND role = 'staff'")
    .bind(targetId).first();
  if (!target) return c.json({ error: '직원 계정을 찾을 수 없습니다.' }, 404);

  if (target.staff_role === 'admin') {
    const count = await c.env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM users WHERE role='staff' AND staff_role='admin'").first();
    if (Number(count?.cnt || 0) <= 1) {
      return c.json({ error: '마지막 관리자 계정은 삭제할 수 없습니다.' }, 409);
    }
  }

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId),
    c.env.DB.prepare('DELETE FROM staff_disabled WHERE user_id = ?').bind(targetId),
    c.env.DB.prepare('DELETE FROM staff_applications WHERE employee_no = ?').bind(target.login_id),
    c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId),
  ]);

  return c.json({ ok: true, message: `${target.name} 직원 계정을 삭제했습니다.` });
});

app.route('/', legacyApp);

export default app;
