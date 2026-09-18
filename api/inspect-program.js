export default async function handler(req,res){
  try{
    const r=await fetch('https://arsiv.mackolik.com/Program/Program.aspx',{
      headers:{'User-Agent':'Mozilla/5.0','Accept-Language':'tr-TR,tr;q=0.9'}
    });
    const html=await r.text();
    const needles=['ChangeDate','IddaaDateCmb','GetProgram','Program.aspx','GameTypecmb','justNotPlayed','__VIEWSTATE'];
    const snippets=[];
    for(const n of needles){
      let i=0,count=0;
      while((i=html.indexOf(n,i))>=0 && count<8){
        snippets.push({n,text:html.slice(Math.max(0,i-500),Math.min(html.length,i+1200))});
        i+=n.length; count++;
      }
    }
    res.status(200).json({status:r.status,len:html.length,snippets});
  }catch(e){res.status(500).json({error:String(e)})}
}