import { CoreError } from './core-client.ts';

/** Core-confirmed Administrador profile has all read/navigation capabilities; writes still need explicit permissions and configuration. */
export function capabilitiesFor(permissions: readonly string[], writes: boolean, profiles: readonly string[] = []): string[] {
  const allowed=new Set<string>();
  if(profiles.includes('Administrador')) for(const capability of ['dashboard.read','requests.read','users.read','catalog.read','audit.read','reports.read'])allowed.add(capability);
  const mappings: Record<string,string[]>={
    'home.view':['dashboard.read'],
    'usuarios.manage':['users.read','users.write'],
    'usuarios.view':['users.read'],
    'users.read':['users.read'], 'users.write':['users.write'],
    'catalog.read':['catalog.read'], 'catalog.write':['catalog.write'],
    'audit.read':['audit.read'],
  };
  for(const permission of permissions) for(const capability of Object.hasOwn(mappings,permission)?mappings[permission]:[]) {
    if(writes || !capability.endsWith('.write')) allowed.add(capability);
  }
  return [...allowed];
}
export function authorizeOperation(method:string,path:string,capabilities:readonly string[]):void {
  const read=method==='GET';
  const capability=path.startsWith('/usuarios')?read?'users.read':'users.write':path.startsWith('/auditoria')?'audit.read':read?'catalog.read':'catalog.write';
  if(!capabilities.includes(capability)) throw new CoreError(403,'Operação não permitida para este usuário');
}
