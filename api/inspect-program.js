export default async function handler(req,res){
  try{
    const url='https://cm.mackolik.com/js5/Mackolik/Program.js?v=22.169';
    const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://arsiv.mackolik.com/Program/Program.aspx'}});
    const js=await r.text();
    const needles=['getWeekDays','getWeekLeagues','Week','ProgramComboHandler','getWeeks','weekac'];
    const hits=[];
    for(const needle of needles){
      let i=0,n=0;
      while((i=js.indexOf(needle,i))>=0 && n<12){
        hits.push({needle,text:js.slice(Math.max(0,i-1200),Math.min(js.length,i+2600))});
        i+=needle.length;n++;
      }
    }
    res.status(200).json({status:r.status,len:js.length,hits});
  }catch(e){res.status(500).json({error:String(e)})}
}