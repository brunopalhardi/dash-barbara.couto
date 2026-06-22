/**
 * Cria um usuário de acesso ao dash no Supabase Auth (email/senha).
 * Credenciais passadas por argumento — NÃO hardcodar no arquivo.
 *
 *   npx tsx --env-file=.env.local scripts/create-user.ts <email> <senha>
 */
// Chama o endpoint admin do GoTrue direto via fetch (evita o realtime client
// do supabase-js, que quebra no Node < 22 sem WebSocket nativo).

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("uso: tsx create-user.ts <email> <senha>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no env.");
  process.exit(1);
}

(async () => {
  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error("ERRO:", res.status, JSON.stringify(body));
    process.exit(1);
  }
  console.log("✓ usuário criado:", body.email, "| id:", body.id);
  process.exit(0);
})();
