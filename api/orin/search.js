import { orinSql, privateResponse, requireOrinOwner, sendError } from '../../apps/portfolio/server/orin.js';
import { searchView, validateViewSearch } from '../../apps/portfolio/server/orin-library-search.js';
export function createSearchHandler({getSql=orinSql,authorize=requireOrinOwner,environment=()=>process.env,search=searchView}={}) {
  return async (req,res)=>{
    privateResponse(res);
    if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed'});}
    try {
      await authorize(req,true);
      const input=validateViewSearch(req.body);
      return res.status(200).json(await search(await getSql(),input,{env:environment()}));
    } catch(error){return sendError(res,error);}
  };
}
export default createSearchHandler();
