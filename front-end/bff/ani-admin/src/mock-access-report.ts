import { CoreError } from './core-client.ts';

/** Deliberate demonstration data, never a fallback for a failed Core request. */
const rows = [
  { id:'demo-sistema-a', sistema:'Sistema demonstrativo A', usuariosAtivos:12, perfisAtivos:3 },
  { id:'demo-sistema-b', sistema:'Sistema demonstrativo B', usuariosAtivos:8, perfisAtivos:2 },
  { id:'demo-sistema-c', sistema:'Sistema demonstrativo C', usuariosAtivos:5, perfisAtivos:1 },
];
export function mockAccessReport(path:string,query:URLSearchParams):unknown {
  if(path!=='/relatorios/acessos') {
    if(query.size)throw new CoreError(400,'Detalhe do relatório não aceita filtros');
    const row=rows.find(value=>path===`/relatorios/acessos/${value.id}`);
    if(!row)throw new CoreError(404,'Registro demonstrativo não encontrado');
    return {...row};
  }
  for(const key of query.keys())if(!['page','pageSize','search'].includes(key)||query.getAll(key).length!==1)throw new CoreError(400,'Filtro não permitido no relatório demonstrativo');
  const pageText=query.get('page')??'1';const sizeText=query.get('pageSize')??'25';
  if(!/^\d+$/.test(pageText)||!/^\d+$/.test(sizeText)||Number(pageText)<1||Number(pageText)>1000000||Number(sizeText)<1||Number(sizeText)>100)throw new CoreError(400,'Paginação inválida');
  const search=(query.get('search')??'').trim().toLocaleLowerCase('pt-BR');
  if(search.length>200)throw new CoreError(400,'Busca acima do limite');
  const filtered=rows.filter(row=>row.sistema.toLocaleLowerCase('pt-BR').includes(search));
  const page=Number(pageText);const pageSize=Number(sizeText);
  return {items:filtered.slice((page-1)*pageSize,page*pageSize).map(row=>({...row})),total:filtered.length,page,pageSize,dataMode:'mock'};
}
