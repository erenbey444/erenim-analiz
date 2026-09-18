export default async function handler(req,res){
  try{
    const raw=String(req.query?.weeks||'24137,24136,24135,24134,24133,24132,24131,24130,24120,24110,24102,24100,24090,24080,24070');
    const weeks=raw.split(',').map(v=>v.trim()).filter(Boolean);
    const out=[];
    for(const week of weeks){
      const url='https://arsiv.mackolik.com/AjaxHandlers/IddaaHandler.aspx?command=weekdays&w='+encodeURIComponent(week);
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://arsiv.mackolik.com/Program/Program.aspx'}});
      const text=await r.text();
      out.push({week,status:r.status,len:text.length,text:text.slice(0,4000)});
    }
    res.status(200).json({out});
  }catch(e){res.status(500).json({error:String(e)})}
}