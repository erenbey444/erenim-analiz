export default async function handler(req,res){
  try{
    const tests=[
      '', '?w=24102','?week=24102','?Week=24102','?weekac=24102',
      '?w=24000','?week=24000'
    ];
    const out=[];
    for(const q of tests){
      const url='https://arsiv.mackolik.com/Program/Program.aspx'+q;
      const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'tr-TR,tr;q=0.9'}});
      const html=await r.text();
      const current=(html.match(/Mackolik\.Program\.CurrentWeek\s*=\s*'([^']+)'/)||[])[1]||'';
      const week=(html.match(/Mackolik\.Program\.Week\s*=\s*'([^']+)'/)||[])[1]||'';
      const date=(html.match(/Mackolik\.Program\.Date\s*=\s*\$\("#IddaaDateCmb"\)\.val\(\)/)||[])[0]||'';
      const selectedDate=(html.match(/<option value="([^"]+)" selected>[^<]+<\/option>/)||[])[1]||'';
      const weekSelect=(html.match(/<select[^>]+id=["']weekac["'][\s\S]*?<\/select>/i)||[])[0]||'';
      out.push({q,status:r.status,len:html.length,current,week,selectedDate,weekSelect:weekSelect.replace(/\s+/g,' ').slice(0,5000)});
    }
    res.status(200).json({out});
  }catch(e){res.status(500).json({error:String(e)})}
}