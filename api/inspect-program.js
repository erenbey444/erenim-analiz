export default async function handler(req,res){
  try{
    const pageUrl='https://arsiv.mackolik.com/Program/Program.aspx';
    const r=await fetch(pageUrl,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'tr-TR,tr;q=0.9'}});
    const html=await r.text();
    const scripts=[...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m=>m[1]);
    const normalized=scripts.map(src=>{
      if(src.startsWith('//')) return 'https:'+src;
      if(src.startsWith('/')) return 'https://arsiv.mackolik.com'+src;
      if(/^https?:/i.test(src)) return src;
      return new URL(src,pageUrl).toString();
    });
    const interesting=[];
    for(const url of normalized){
      try{
        const jr=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':pageUrl}});
        const text=await jr.text();
        if(/getBetsByLeague|getBetsByDate|Mackolik\.Program/i.test(text)){
          const hits=[];
          for(const needle of ['getBetsByLeague','getBetsByDate','changeTab','getComboData','Mackolik.Program']){
            let i=0,n=0;
            while((i=text.indexOf(needle,i))>=0 && n<10){
              hits.push({needle,text:text.slice(Math.max(0,i-900),Math.min(text.length,i+2200))});
              i+=needle.length;n++;
            }
          }
          interesting.push({url,len:text.length,hits});
        }
      }catch{}
    }
    res.status(200).json({status:r.status,scriptCount:normalized.length,scripts:normalized,interesting});
  }catch(e){res.status(500).json({error:String(e)})}
}