export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'content-type': 'application/json',
      'set-cookie': 'mall_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  });
}
