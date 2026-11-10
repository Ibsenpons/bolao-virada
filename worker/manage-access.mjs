// Server-only Cloudflare Access integration. Never expose the API token.
const account = '2ae7445b4f4a45c318081b7f22f24715';
const policy = '0add376e-f361-44f6-b7df-d22df6dea372';
const app = '7a6abc45-12e5-486c-9828-1c5268a8d153';
const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + account + '/access/apps/' + app + '/policies/' + policy;
const emailOf = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim()) ? value.trim().toLowerCase() : null;
const fields = ['name','decision','include','exclude','require','approval_groups','approval_required','connection_rules','isolation_required','mfa_config','purpose_justification_prompt','purpose_justification_required','session_duration','policy_resolution_account_id'];
export async function manageAccess(env, input, fetcher = fetch) {
  if (!env.CF_ACCESS_API_TOKEN) return {status:503,error:'Integração de acesso não configurada.'};
  const request = async (method, body) => {
    const response = await fetcher(endpoint, {method, headers:{Authorization:'Bearer '+env.CF_ACCESS_API_TOKEN,'Content-Type':'application/json'}, ...(body ? {body:JSON.stringify(body)} : {})});
    const data = await response.json();
    if (!response.ok || !data.success || !data.result) throw new Error('Cloudflare API HTTP ' + response.status);
    return data.result;
  };
  try {
    const current = await request('GET');
    if (current.id !== policy || current.name !== 'Participantes do Bolão' || current.decision !== 'allow' || (current.app_count != null && current.app_count !== 1) || !Array.isArray(current.include) || !current.include.length || !current.include.every(r => Object.keys(r).length === 1 && emailOf(r.email?.email))) return {status:409,error:'Política diferente da esperada. Revise no Cloudflare.'};
    const emails = current.include.map(r=>emailOf(r.email.email));
    if (!input) return {status:200,emails};
    const email = emailOf(input.email);
    if (!email) return {status:400,error:'E-mail inválido.'};
    if (input.action !== 'add') return {status:400,error:'Ação inválida.'};
    if (emails.includes(email)) return {status:200,emails};
    const payload = Object.fromEntries(fields.filter(k=>current[k] != null).map(k=>[k,current[k]]));
    payload.include = [...current.include,{email:{email}}];
    await request('PUT',payload);
    const updated = await request('GET');
    const actual = updated.include?.map(r=>emailOf(r.email?.email)) || [];
    if (![...emails,email].every(e=>actual.includes(e))) return {status:502,error:'Não foi possível confirmar a atualização. Confira no Cloudflare.'};
    return {status:200,emails:actual};
  } catch (error) { const status = /^Cloudflare API HTTP (\d{3})$/.exec(error.message)?.[1]; return {status:502,error:'Não foi possível consultar ou atualizar o Cloudflare.' + (status ? ' HTTP ' + status + '.' : ' Confira a configuração.')}; }
}
