export default async function handler(req,res){
  try{
    const cases=[];
    const dates=[
      {date:'18.09.2026',week:'24137',label:'current'},
      {date:'17.01.2026',week:'24102',label:'historical'}
    ];
    const leagues=['-1','0',''];
    const sports=['Football','1'];
    const ips=['1','0'];
    const types=['1','2'];
    for(const d of dates){
      for(const l of leagues){
        for(const st of sports){
          for(const ip of ips){
            for(const type of types){
              const url='https://arsiv.mackolik.com/AjaxHandlers/IddaaHandler.aspx?command=tab&type='+type+'&st='+encodeURIComponent(st)+'&l='+encodeURIComponent(l)+'&d='+encodeURIComponent(d.date)+'&i=0&t=&ip='+ip+'&w='+d.week+'&g=7&np=0&srt=-1&srtd=1';
              const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'tr-TR,tr;q=0.9','Referer':'https://arsiv.mackolik.com/Program/Program.aspx'}});
              const html=await r.text();
              if(html.length>260 || r.status!==200){
                cases.push({label:d.label,date:d.date,week:d.week,l,st,ip,type,status:r.status,len:html.length,has145:html.includes('1.45'),has191:html.includes('1.91'),sample:html.replace(/\s+/g,' ').slice(0,1800)});
              }
            }
          }
        }
      }
    }
    res.status(200).json({cases});
  }catch(e){res.status(500).json({error:String(e)})}
}