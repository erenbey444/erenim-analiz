export default async function handler(req,res){
  try{
    const date=String(req.query?.date||'17.01.2026');
    const week=String(req.query?.week||'24137');
    const url='https://arsiv.mackolik.com/AjaxHandlers/IddaaHandler.aspx?command=tab&type=1&st=Football&l=-1&d='+encodeURIComponent(date)+'&i=0&t=&ip=1&w='+encodeURIComponent(week)+'&g=7&np=0&srt=-1&srtd=1';
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'tr-TR,tr;q=0.9','Referer':'https://arsiv.mackolik.com/Program/Program.aspx'}});
    const html=await r.text();
    const text=html.replace(/\s+/g,' ').slice(0,120000);
    res.status(200).json({url,status:r.status,len:html.length,has145:html.includes('1.45'),has191:html.includes('1.91'),sample:text});
  }catch(e){res.status(500).json({error:String(e)})}
}