import React,{useState,useEffect,useCallback,useMemo,useRef} from 'react'
import{BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,PieChart,Pie,Cell,AreaChart,Area,LineChart,Line,RadarChart,Radar,PolarGrid,PolarAngleAxis,PolarRadiusAxis} from 'recharts'

const CL=['#2563eb','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#f97316','#14b8a6','#a855f7']
const HCL={'Excellent':'#10b981','Good':'#2563eb','Fair':'#f59e0b','Poor':'#ef4444'}
const hc=s=>s>=80?'#10b981':s>=60?'#2563eb':s>=40?'#f59e0b':'#ef4444'

// Theme context
const ThemeCtx=React.createContext()
function useTheme(){return React.useContext(ThemeCtx)}

function ThemeProvider({children}){
  const[dark,setDark]=useState(()=>{try{return localStorage.getItem('zm-theme')!=='light'}catch{return true}})
  const toggle=()=>setDark(p=>{const n=!p;try{localStorage.setItem('zm-theme',n?'dark':'light')}catch{};return n})
  const t=dark?{
    bg:'#0f172a',bg2:'#1e293b',bg3:'#334155',border:'#334155',text:'#f1f5f9',text2:'#94a3b8',text3:'#64748b',
    accent:'#2563eb',card:'#1e293b',input:'#1e293b',hover:'#334155',ttBg:'#1e293b',
  }:{
    bg:'#f8fafc',bg2:'#ffffff',bg3:'#e2e8f0',border:'#e2e8f0',text:'#0f172a',text2:'#475569',text3:'#94a3b8',
    accent:'#2563eb',card:'#ffffff',input:'#f1f5f9',hover:'#f1f5f9',ttBg:'#ffffff',
  }
  return <ThemeCtx.Provider value={{dark,toggle,t}}>{children}</ThemeCtx.Provider>
}

// CSV export utility
function downloadCSV(rows,filename){
  if(!rows.length)return
  const keys=Object.keys(rows[0])
  const csv=[keys.join(','),...rows.map(r=>keys.map(k=>`"${String(r[k]||'').replace(/"/g,'""')}"`).join(','))].join('\n')
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'})
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click()
}

// HTML to PDF-like print
function printReport(title,html){
  const w=window.open('','_blank')
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title><style>body{font-family:Inter,sans-serif;padding:40px;color:#1a1a2e}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:8px 12px;border:1px solid #e2e8f0;text-align:left}th{background:#f1f5f9;font-weight:600}.h{text-align:center;margin-bottom:24px}.h h1{font-size:24px;color:#2563eb}.h p{color:#64748b;font-size:14px}@media print{body{padding:20px}}</style></head><body>${html}</body></html>`)
  w.document.close()
  setTimeout(()=>w.print(),500)
}

function App(){
  return <ThemeProvider><AppInner/></ThemeProvider>
}

function AppInner(){
  const{dark,toggle,t}=useTheme()
  const[pg,setPg]=useState('dashboard')
  const[stats,setStats]=useState(null)
  const[mtgs,setMtgs]=useState({meetings:[],total:0,pages:1})
  const[parts,setParts]=useState({participants:[],total:0})
  const[recs,setRecs]=useState({recordings:[],total:0})
  const[sel,setSel]=useState(null)
  const[srch,setSrch]=useState('')
  const[stFilt,setStFilt]=useState('')
  const[dateFrom,setDateFrom]=useState('')
  const[dateTo,setDateTo]=useState('')
  const[durMin,setDurMin]=useState('')
  const[durMax,setDurMax]=useState('')
  const[healthMin,setHealthMin]=useState('')
  const[partMin,setPartMin]=useState('')
  const[sortBy,setSortBy]=useState('date_desc')
  const[cp,setCp]=useState(1)
  const[lr,setLr]=useState(new Date())
  const[ld,setLd]=useState(true)
  const[showFilters,setShowFilters]=useState(false)
  const[sideCollapsed,setSideCollapsed]=useState(false)

  const buildQuery=useCallback(()=>{
    const p=new URLSearchParams()
    p.set('page',cp);p.set('limit','20');p.set('sort',sortBy)
    if(srch)p.set('search',srch)
    if(stFilt)p.set('status',stFilt)
    if(dateFrom)p.set('dateFrom',dateFrom)
    if(dateTo)p.set('dateTo',dateTo)
    if(durMin)p.set('durMin',durMin)
    if(durMax)p.set('durMax',durMax)
    if(healthMin)p.set('healthMin',healthMin)
    if(partMin)p.set('partMin',partMin)
    return p.toString()
  },[cp,srch,stFilt,dateFrom,dateTo,durMin,durMax,healthMin,partMin,sortBy])

  const fetchData=useCallback(async()=>{
    try{
      const[s,m]=await Promise.all([
        fetch('/api/stats').then(r=>r.json()),
        fetch(`/api/meetings?${buildQuery()}`).then(r=>r.json()),
      ])
      setStats(s);setMtgs(m);setLr(new Date());setLd(false)
    }catch(e){console.error(e);setLd(false)}
  },[buildQuery])

  useEffect(()=>{fetchData()},[fetchData])
  useEffect(()=>{const i=setInterval(fetchData,30000);return()=>clearInterval(i)},[fetchData])

  const fetchParts=async()=>{setParts(await fetch('/api/participants').then(r=>r.json()))}
  const fetchRecs=async()=>{setRecs(await fetch('/api/recordings').then(r=>r.json()))}
  const fetchDetail=async(idx)=>{const r=await fetch(`/api/meeting-detail?idx=${idx}`).then(r=>r.json());setSel(r);setPg('detail')}
  const navTo=(p)=>{setPg(p);setSel(null);if(p==='participants')fetchParts();if(p==='recordings')fetchRecs()}

  const exportAll=async(format)=>{
    const data=await fetch('/api/export').then(r=>r.json())
    if(format==='csv')downloadCSV(data.rows,'Zoom_Meeting_Report.csv')
    else{
      const hdr='<div class="h"><h1>📊 Zoom Meeting & Recording Report</h1><p>Coach Neuro Recode · Generated '+new Date().toLocaleDateString()+'</p><p>'+data.total+' meetings total</p></div>'
      const tbl='<table><thead><tr>'+Object.keys(data.rows[0]).map(k=>'<th>'+k+'</th>').join('')+'</tr></thead><tbody>'+data.rows.map(r=>'<tr>'+Object.values(r).map(v=>'<td>'+String(v||'').substring(0,200)+'</td>').join('')+'</tr>').join('')+'</tbody></table>'
      printReport('Zoom Meeting Report',hdr+tbl)
    }
  }

  const clearFilters=()=>{setDateFrom('');setDateTo('');setDurMin('');setDurMax('');setHealthMin('');setPartMin('');setStFilt('');setSrch('');setCp(1)}
  const activeFilters=[stFilt,dateFrom,dateTo,durMin,durMax,healthMin,partMin].filter(Boolean).length

  const S={
    app:{display:'flex',minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'Inter',-apple-system,sans-serif",transition:'all .3s'},
    sb:{width:sideCollapsed?72:260,background:t.bg2,borderRight:`1px solid ${t.border}`,position:'fixed',height:'100vh',overflowY:'auto',zIndex:10,transition:'width .3s'},
    mn:{marginLeft:sideCollapsed?72:260,flex:1,padding:'20px 28px',minHeight:'100vh',transition:'margin .3s'},
  }

  return(
    <div style={S.app}>
      {/* Sidebar */}
      <div style={S.sb}>
        <div style={{padding:sideCollapsed?'20px 12px':'20px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:12,justifyContent:sideCollapsed?'center':'flex-start'}}>
          <svg viewBox="0 0 36 36" fill="none" style={{width:32,height:32,flexShrink:0}}><rect width="36" height="36" rx="8" fill="#2563eb"/><path d="M10 13a2 2 0 012-2h8a2 2 0 012 2v6a2 2 0 01-2 2h-8a2 2 0 01-2-2v-6z" fill="#fff"/><path d="M22 14.5l4-2v7l-4-2v-3z" fill="#fff" opacity="0.8"/></svg>
          {!sideCollapsed&&<div><div style={{fontWeight:700,fontSize:16,color:t.text}}>Zoom Tracker</div><div style={{fontSize:11,color:t.text3}}>Live Analytics v2.0</div></div>}
        </div>
        <div style={{padding:'12px 8px'}}>
          {!sideCollapsed&&<div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:1.2,color:t.text3,padding:'0 8px',marginBottom:8}}>Navigation</div>}
          {[
            {id:'dashboard',icon:'📊',label:'Dashboard',badge:null,live:true},
            {id:'meetings',icon:'📅',label:'All Meetings',badge:stats?.total_meetings},
            {id:'participants',icon:'👥',label:'Participants',badge:stats?.total_participants_unique},
            {id:'recordings',icon:'🎬',label:'Recordings',badge:stats?.meetings_with_recordings},
            {id:'analytics',icon:'📈',label:'Analytics',badge:null},
          ].map(n=>(
            <div key={n.id} style={{display:'flex',alignItems:'center',gap:10,padding:sideCollapsed?'10px 0':'10px 12px',borderRadius:8,cursor:'pointer',background:pg===n.id?t.accent:'transparent',color:pg===n.id?'#fff':t.text2,fontSize:13,fontWeight:500,marginBottom:2,justifyContent:sideCollapsed?'center':'flex-start',transition:'all .2s'}} onClick={()=>navTo(n.id)}
              onMouseEnter={e=>{if(pg!==n.id)e.currentTarget.style.background=t.hover}} onMouseLeave={e=>{if(pg!==n.id)e.currentTarget.style.background='transparent'}}>
              <span style={{fontSize:18}}>{n.icon}</span>
              {!sideCollapsed&&<span>{n.label}</span>}
              {!sideCollapsed&&n.live&&<span style={{display:'inline-flex',alignItems:'center',gap:4,background:'#dc262620',color:'#ef4444',padding:'2px 8px',borderRadius:12,fontSize:10,fontWeight:600,marginLeft:'auto'}}><span style={{width:6,height:6,background:'#ef4444',borderRadius:'50%',animation:'pulse 1.5s infinite'}}></span>LIVE</span>}
              {!sideCollapsed&&n.badge!=null&&<span style={{background:'#ef4444',color:'#fff',fontSize:10,padding:'1px 6px',borderRadius:10,marginLeft:'auto'}}>{n.badge}</span>}
            </div>
          ))}
        </div>
        <div style={{padding:'12px 8px',borderTop:`1px solid ${t.border}`}}>
          {!sideCollapsed&&<div style={{fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:1.2,color:t.text3,padding:'0 8px',marginBottom:8}}>Export</div>}
          <div style={{display:'flex',alignItems:'center',gap:10,padding:sideCollapsed?'10px 0':'10px 12px',borderRadius:8,cursor:'pointer',color:t.text2,fontSize:13,fontWeight:500,justifyContent:sideCollapsed?'center':'flex-start'}} onClick={()=>exportAll('csv')}
            onMouseEnter={e=>e.currentTarget.style.background=t.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{fontSize:18}}>📥</span>{!sideCollapsed&&<span>Export Excel/CSV</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:sideCollapsed?'10px 0':'10px 12px',borderRadius:8,cursor:'pointer',color:t.text2,fontSize:13,fontWeight:500,justifyContent:sideCollapsed?'center':'flex-start'}} onClick={()=>exportAll('pdf')}
            onMouseEnter={e=>e.currentTarget.style.background=t.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <span style={{fontSize:18}}>📄</span>{!sideCollapsed&&<span>Export PDF</span>}
          </div>
        </div>
        <div style={{padding:'12px 8px',borderTop:`1px solid ${t.border}`,display:'flex',flexDirection:sideCollapsed?'column':'row',gap:8,alignItems:'center',justifyContent:'center'}}>
          <button onClick={toggle} style={{background:t.bg3,border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:16,color:t.text}} title={dark?'Light mode':'Dark mode'}>{dark?'☀️':'🌙'}</button>
          <button onClick={()=>setSideCollapsed(p=>!p)} style={{background:t.bg3,border:'none',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:14,color:t.text}} title="Toggle sidebar">{sideCollapsed?'▶':'◀'}</button>
        </div>
        {!sideCollapsed&&<div style={{padding:'8px 20px',fontSize:10,color:t.text3}}>Refreshed: {lr.toLocaleTimeString()}</div>}
      </div>

      {/* Main */}
      <div style={S.mn}>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}} input[type=date]{color-scheme:${dark?'dark':'light'}}`}</style>
        {ld&&!stats?<div style={{textAlign:'center',padding:80,color:t.text3}}><div style={{fontSize:40,marginBottom:16}}>⏳</div><h3 style={{color:t.text2}}>Loading live data...</h3></div>
        :pg==='dashboard'?<Dashboard stats={stats} mtgs={mtgs} onView={fetchDetail} t={t}/>
        :pg==='meetings'?<Meetings mtgs={mtgs} srch={srch} setSrch={setSrch} stFilt={stFilt} setStFilt={setStFilt} cp={cp} setCp={setCp} onView={fetchDetail} t={t} showFilters={showFilters} setShowFilters={setShowFilters} dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} durMin={durMin} setDurMin={setDurMin} durMax={durMax} setDurMax={setDurMax} healthMin={healthMin} setHealthMin={setHealthMin} partMin={partMin} setPartMin={setPartMin} sortBy={sortBy} setSortBy={setSortBy} clearFilters={clearFilters} activeFilters={activeFilters} exportAll={exportAll}/>
        :pg==='participants'?<Participants parts={parts} t={t}/>
        :pg==='recordings'?<Recordings recs={recs} onView={fetchDetail} t={t}/>
        :pg==='analytics'?<Analytics stats={stats} t={t}/>
        :pg==='detail'&&sel?<Detail m={sel} onBack={()=>navTo('meetings')} t={t} exportAll={exportAll}/>
        :null}
      </div>
    </div>
  )
}

function Card({children,t,style={}}){return <div style={{background:t.card,border:`1px solid ${t.border}`,borderRadius:12,padding:20,...style}}>{children}</div>}
function CardTitle({children,t}){return <h3 style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:14}}>{children}</h3>}
function Badge({children,color}){return <span style={{display:'inline-block',padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,background:color+'20',color}}>{children}</span>}
function Stat({icon,label,value,sub,color,t}){return <Card t={t}><div style={{fontSize:20,marginBottom:8}}>{icon}</div><div style={{fontSize:11,color:t.text3,fontWeight:500,textTransform:'uppercase',letterSpacing:.5}}>{label}</div><div style={{fontSize:28,fontWeight:800,color:color||t.text,marginTop:4,lineHeight:1}}>{value}</div>{sub&&<div style={{fontSize:11,color:t.text3,marginTop:6}}>{sub}</div>}</Card>}
function Btn({children,active,onClick,t,small}){return <button onClick={onClick} style={{background:active?t.accent:t.input,border:`1px solid ${active?t.accent:t.border}`,borderRadius:8,padding:small?'6px 12px':'8px 16px',color:active?'#fff':t.text2,fontSize:small?11:13,cursor:'pointer',fontWeight:500,transition:'all .2s'}}>{children}</button>}
function Input({t,...props}){return <input {...props} style={{background:t.input,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 14px',color:t.text,fontSize:13,outline:'none',width:'100%',...(props.style||{})}}/>}

const ttStyle=t=>({background:t.ttBg,border:`1px solid ${t.border}`,borderRadius:8,color:t.text,boxShadow:'0 4px 12px rgba(0,0,0,.15)'})

function Dashboard({stats,mtgs,onView,t}){
  if(!stats)return null
  const hpd=Object.entries(stats.health_distribution).map(([k,v])=>({name:k,value:v}))
  return(<>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
      <div><h2 style={{fontSize:24,fontWeight:700,color:t.text}}>Dashboard <span style={{display:'inline-flex',alignItems:'center',gap:4,background:'#dc262620',color:'#ef4444',padding:'3px 10px',borderRadius:16,fontSize:11,fontWeight:600,verticalAlign:'middle'}}><span style={{width:6,height:6,background:'#ef4444',borderRadius:'50%',animation:'pulse 1.5s infinite'}}></span>LIVE</span></h2><p style={{fontSize:13,color:t.text3,marginTop:2}}>Real-time Zoom meeting analytics — Coach Neuro Recode</p></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:14,marginBottom:20}}>
      <Stat icon="📅" label="Total Meetings" value={stats.total_meetings} sub={`${stats.completed_meetings} done · ${stats.upcoming_meetings} upcoming`} t={t}/>
      <Stat icon="⏱️" label="Total Hours" value={stats.total_hours} sub={`Avg ${stats.avg_duration_minutes} min`} color="#10b981" t={t}/>
      <Stat icon="👥" label="Participants" value={stats.total_participants_unique} sub="Unique people" color="#f59e0b" t={t}/>
      <Stat icon="🎬" label="Recordings" value={stats.meetings_with_recordings} sub={`${Math.round(stats.meetings_with_recordings/stats.total_meetings*100)}% coverage`} color="#8b5cf6" t={t}/>
      <Stat icon="💚" label="Health Score" value={stats.avg_health_score} sub="Average across all" color={hc(stats.avg_health_score)} t={t}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:14,marginBottom:20}}>
      <Card t={t}><CardTitle t={t}>📈 Daily Meeting Activity</CardTitle>
        <ResponsiveContainer width="100%" height={240}><AreaChart data={stats.daily_chart}><defs><linearGradient id="cM" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={.3}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis dataKey="date" tick={{fill:t.text3,fontSize:10}} tickFormatter={d=>d.slice(5)}/><YAxis tick={{fill:t.text3,fontSize:10}}/><Tooltip contentStyle={ttStyle(t)}/><Area type="monotone" dataKey="meetings" stroke="#2563eb" fill="url(#cM)" strokeWidth={2}/></AreaChart></ResponsiveContainer>
      </Card>
      <Card t={t}><CardTitle t={t}>💚 Health Distribution</CardTitle>
        <ResponsiveContainer width="100%" height={240}><PieChart><Pie data={hpd} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={4} dataKey="value" label={({name,value})=>`${name}: ${value}`}>{hpd.map((e,i)=><Cell key={i} fill={HCL[e.name]||CL[i]}/>)}</Pie><Tooltip contentStyle={ttStyle(t)}/></PieChart></ResponsiveContainer>
      </Card>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
      <Card t={t}><CardTitle t={t}>👥 Top Participants</CardTitle>
        <ResponsiveContainer width="100%" height={300}><BarChart data={stats.top_participants.slice(0,10)} layout="vertical"><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis type="number" tick={{fill:t.text3,fontSize:10}}/><YAxis dataKey="name" type="category" width={130} tick={{fill:t.text2,fontSize:11}}/><Tooltip contentStyle={ttStyle(t)}/><Bar dataKey="meetings" fill="#2563eb" radius={[0,4,4,0]}/></BarChart></ResponsiveContainer>
      </Card>
      <Card t={t}><CardTitle t={t}>🕐 Peak Meeting Hours</CardTitle>
        <ResponsiveContainer width="100%" height={300}><BarChart data={stats.hourly_chart}><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis dataKey="hour" tick={{fill:t.text3,fontSize:10}} tickFormatter={h=>`${h}h`}/><YAxis tick={{fill:t.text3,fontSize:10}}/><Tooltip contentStyle={ttStyle(t)}/><Bar dataKey="count" fill="#8b5cf6" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>
      </Card>
    </div>
    <Card t={t}><CardTitle t={t}>📅 Recent Meetings</CardTitle>
      <MeetingsTable meetings={(mtgs.meetings||[]).slice(0,8)} onView={onView} t={t} compact/>
    </Card>
  </>)
}

function MeetingsTable({meetings,onView,t,compact}){
  return <div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
    <thead><tr>{['Topic','Date','Duration','People','Host','Health','Status','Rec'].map(h=><th key={h} style={{textAlign:'left',padding:compact?'8px 12px':'10px 14px',fontSize:10,fontWeight:600,textTransform:'uppercase',letterSpacing:.5,color:t.text3,borderBottom:`1px solid ${t.border}`,background:t.bg+'80'}}>{h}</th>)}</tr></thead>
    <tbody>{meetings.map((m,i)=><tr key={i} style={{cursor:'pointer'}} onClick={()=>onView(m._idx)}
      onMouseEnter={e=>e.currentTarget.style.background=t.hover} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
      <td style={{padding:compact?'8px 12px':'10px 14px',fontSize:12,fontWeight:600,color:t.text,maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',borderBottom:`1px solid ${t.bg}`}}>{m.meeting_topic}</td>
      <td style={{padding:compact?'8px 12px':'10px 14px',fontSize:12,color:t.text2,whiteSpace:'nowrap',borderBottom:`1px solid ${t.bg}`}}>{m.meeting_start_time_display||m.schedule_start_time_display||'-'}</td>
      <td style={{padding:compact?'8px 12px':'10px 14px',fontSize:12,color:t.text2,borderBottom:`1px solid ${t.bg}`}}>{m.duration_minutes>0?`${m.duration_minutes}m`:'-'}</td>
      <td style={{padding:compact?'8px 12px':'10px 14px',fontSize:12,color:t.text2,borderBottom:`1px solid ${t.bg}`}}>{m.participant_size||0}</td>
      <td style={{padding:compact?'8px 12px':'10px 14px',fontSize:12,color:t.text2,borderBottom:`1px solid ${t.bg}`,maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.owner_name||'-'}</td>
      <td style={{padding:compact?'8px 12px':'10px 14px',borderBottom:`1px solid ${t.bg}`}}><Badge color={hc(m.health?.score||0)}>{m.health?.score||0}</Badge></td>
      <td style={{padding:compact?'8px 12px':'10px 14px',borderBottom:`1px solid ${t.bg}`}}><Badge color={m.status==='Completed'?'#10b981':m.status==='Upcoming'?'#2563eb':'#f59e0b'}>{m.status}</Badge></td>
      <td style={{padding:compact?'8px 12px':'10px 14px',fontSize:14,borderBottom:`1px solid ${t.bg}`}}>{m.has_recording?'🎬':'—'}</td>
    </tr>)}</tbody>
  </table></div>
}

function Meetings({mtgs,srch,setSrch,stFilt,setStFilt,cp,setCp,onView,t,showFilters,setShowFilters,dateFrom,setDateFrom,dateTo,setDateTo,durMin,setDurMin,durMax,setDurMax,healthMin,setHealthMin,partMin,setPartMin,sortBy,setSortBy,clearFilters,activeFilters,exportAll}){
  return(<>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:t.text}}>All Meetings</h2><p style={{fontSize:13,color:t.text3,marginTop:2}}>Complete meeting directory with advanced filtering</p></div>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={()=>exportAll('csv')} t={t} small>📥 Excel</Btn>
        <Btn onClick={()=>exportAll('pdf')} t={t} small>📄 PDF</Btn>
      </div>
    </div>
    {/* Search + Filter Bar */}
    <Card t={t} style={{marginBottom:14,padding:16}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <div style={{flex:1,minWidth:240}}><Input t={t} placeholder="🔍 Search topic, participant, host, email..." value={srch} onChange={e=>{setSrch(e.target.value);setCp(1)}}/></div>
        {['','Completed','Upcoming'].map(s=><Btn key={s} active={stFilt===s} onClick={()=>{setStFilt(s);setCp(1)}} t={t} small>{s||'All'}</Btn>)}
        <Btn onClick={()=>setShowFilters(p=>!p)} t={t} small active={showFilters||activeFilters>0}>🎛️ Filters{activeFilters>0?` (${activeFilters})`:''}</Btn>
        {activeFilters>0&&<Btn onClick={clearFilters} t={t} small>✕ Clear</Btn>}
      </div>
      {showFilters&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginTop:14,paddingTop:14,borderTop:`1px solid ${t.border}`}}>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Date From</label><Input t={t} type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);setCp(1)}}/></div>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Date To</label><Input t={t} type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);setCp(1)}}/></div>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Min Duration (min)</label><Input t={t} type="number" placeholder="0" value={durMin} onChange={e=>{setDurMin(e.target.value);setCp(1)}}/></div>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Max Duration (min)</label><Input t={t} type="number" placeholder="∞" value={durMax} onChange={e=>{setDurMax(e.target.value);setCp(1)}}/></div>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Min Health Score</label><Input t={t} type="number" placeholder="0" value={healthMin} onChange={e=>{setHealthMin(e.target.value);setCp(1)}}/></div>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Min Participants</label><Input t={t} type="number" placeholder="0" value={partMin} onChange={e=>{setPartMin(e.target.value);setCp(1)}}/></div>
        <div><label style={{fontSize:11,color:t.text3,display:'block',marginBottom:4}}>Sort By</label>
          <select value={sortBy} onChange={e=>{setSortBy(e.target.value);setCp(1)}} style={{background:t.input,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 14px',color:t.text,fontSize:13,width:'100%'}}>
            <option value="date_desc">Date (Newest)</option><option value="date_asc">Date (Oldest)</option>
            <option value="duration_desc">Duration (Longest)</option><option value="duration_asc">Duration (Shortest)</option>
            <option value="health_desc">Health (Highest)</option><option value="health_asc">Health (Lowest)</option>
            <option value="participants_desc">Participants (Most)</option>
          </select>
        </div>
      </div>}
    </Card>
    <Card t={t}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <span style={{fontSize:12,color:t.text3}}>{mtgs.total} meetings found</span>
        <span style={{fontSize:12,color:t.text3}}>Page {cp} of {mtgs.pages}</span>
      </div>
      <MeetingsTable meetings={mtgs.meetings||[]} onView={onView} t={t}/>
      {mtgs.pages>1&&<div style={{display:'flex',justifyContent:'center',gap:6,marginTop:16}}>
        {cp>1&&<Btn onClick={()=>setCp(p=>p-1)} t={t} small>← Prev</Btn>}
        {Array.from({length:Math.min(mtgs.pages,7)},(_,i)=>{
          let p;const half=3;if(mtgs.pages<=7)p=i+1;else if(cp<=half+1)p=i+1;else if(cp>=mtgs.pages-half)p=mtgs.pages-6+i;else p=cp-half+i;
          return <Btn key={p} active={cp===p} onClick={()=>setCp(p)} t={t} small>{p}</Btn>
        })}
        {cp<mtgs.pages&&<Btn onClick={()=>setCp(p=>p+1)} t={t} small>Next →</Btn>}
      </div>}
    </Card>
  </>)
}

function Detail({m,onBack,t,exportAll}){
  if(!m||m.error)return <div style={{textAlign:'center',padding:60,color:t.text3}}><h3>Meeting not found</h3><button onClick={onBack} style={{marginTop:16,background:t.accent,color:'#fff',border:'none',borderRadius:8,padding:'10px 20px',cursor:'pointer'}}>← Back</button></div>

  const exportSingle=(fmt)=>{
    const row={
      'Topic':m.meeting_topic,'ID':m.meeting_id,'Status':m.status,'Host':m.owner_name,'Duration (min)':m.duration_minutes,
      'Participants':m.participant_size,'Health Score':m.health?.score,'Scheduled Start':m.schedule_start_time_display,
      'Actual Start':m.meeting_start_time_display,'Actual End':m.meeting_end_time_display,
      'Attendees':(m.attendees||[]).map(a=>a.user_name).join(', '),'Summary':(m.recording_summary||m.summary_content||'').substring(0,500)
    }
    if(fmt==='csv')downloadCSV([row],`Meeting_${m.meeting_topic?.replace(/[^a-zA-Z0-9]/g,'_')}.csv`)
    else{
      const html='<div class="h"><h1>📋 '+m.meeting_topic+'</h1><p>Meeting Report · '+m.meeting_start_time_display+'</p></div><table>'+Object.entries(row).map(([k,v])=>'<tr><th style="width:200px">'+k+'</th><td>'+v+'</td></tr>').join('')+'</table>'
      +(m.participant_details?.length?'<h3 style="margin-top:24px">Participant Timeline</h3><table><tr><th>Name</th><th>Role</th><th>Joined</th><th>Left</th><th>Active</th><th>Gap</th></tr>'+m.participant_details.map(p=>'<tr><td>'+p.name+'</td><td>'+(p.is_host?'Host':'Guest')+'</td><td>'+p.join_time+'</td><td>'+p.leave_time+'</td><td>'+p.active_min+'m</td><td>'+p.gap_min+'m</td></tr>').join('')+'</table>':'')
      printReport(`Meeting - ${m.meeting_topic}`,html)
    }
  }

  return(<>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <button onClick={onBack} style={{background:'transparent',border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 16px',color:t.text2,cursor:'pointer',fontSize:13}}>← Back to Meetings</button>
      <div style={{display:'flex',gap:8}}>
        <Btn onClick={()=>exportSingle('csv')} t={t} small>📥 Excel</Btn>
        <Btn onClick={()=>exportSingle('pdf')} t={t} small>📄 PDF</Btn>
      </div>
    </div>
    <div style={{marginBottom:20}}><h2 style={{fontSize:22,fontWeight:700,color:t.text}}>{m.meeting_topic}</h2><p style={{fontSize:13,color:t.text3}}>ID: {m.meeting_id} · {m.status} · Meeting #{m.meeting_number||'N/A'}</p></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:14,marginBottom:20}}>
      <Stat icon="⏱" label="Duration" value={`${m.duration_minutes}m`} t={t}/>
      <Stat icon="👥" label="Participants" value={m.participant_size||0} t={t}/>
      <Stat icon="💚" label="Health" value={`${m.health?.score||0}/100`} color={hc(m.health?.score||0)} t={t}/>
      <Stat icon="🎬" label="Recording" value={m.has_recording?'Yes':'No'} color={m.has_recording?'#10b981':'#ef4444'} t={t}/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
      <Card t={t}><CardTitle t={t}>📋 Meeting Details</CardTitle>
        {[['Topic',m.meeting_topic],['Meeting ID',m.meeting_id],['Number',m.meeting_number||'N/A'],['Host',m.owner_name||'N/A'],['Email',m.host_email||'N/A'],['Sched. Start',m.schedule_start_time_display||'N/A'],['Sched. End',m.schedule_end_time_display||'N/A'],['Actual Start',m.meeting_start_time_display||'N/A'],['Actual End',m.meeting_end_time_display||'N/A'],['Join URL',m.join_url||'N/A']].map(([k,v],i)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:`1px solid ${t.bg}40`}}><span style={{fontSize:12,color:t.text3}}>{k}</span><span style={{fontSize:12,color:t.text,fontWeight:500,textAlign:'right',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{v}</span></div>)}
      </Card>
      <Card t={t}><CardTitle t={t}>💚 Health Breakdown</CardTitle>
        {(m.health?.factors||[]).map((f,i)=><div key={i} style={{marginBottom:14}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{fontSize:12,color:t.text2}}>{f.n}</span><span style={{fontSize:12,fontWeight:600,color:t.text}}>{f.s}/25</span></div>
          <div style={{height:8,borderRadius:4,background:t.bg3,overflow:'hidden'}}><div style={{height:'100%',borderRadius:4,width:`${(f.s/25)*100}%`,background:hc(f.s*4),transition:'width .5s'}}></div></div>
          <div style={{fontSize:10,color:t.text3,marginTop:3}}>{f.d}</div>
        </div>)}
      </Card>
    </div>
    <Card t={t} style={{marginBottom:20}}><CardTitle t={t}>👥 Participant Timeline & Conversation Gaps</CardTitle>
      {(m.participant_details||[]).length>0?<div>
        {m.participant_details.map((p,i)=><div key={i} style={{display:'flex',gap:14,padding:'12px 0',borderLeft:`3px solid ${p.is_host?'#2563eb':'#10b981'}`,paddingLeft:16,marginLeft:6,position:'relative'}}>
          <div style={{width:36,height:36,borderRadius:'50%',background:CL[i%CL.length],display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:14,flexShrink:0}}>{p.name[0]}</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600,color:t.text,fontSize:13}}>{p.name} {p.is_host&&<Badge color="#2563eb">Host</Badge>}</div>
            <div style={{fontSize:12,color:t.text3,marginTop:2}}>Joined: {p.join_time} · Left: {p.leave_time}</div>
            <div style={{display:'flex',gap:12,marginTop:4}}>
              <span style={{fontSize:11,color:t.text2}}>⏱ Active: {p.active_min}m</span>
              {p.email&&<span style={{fontSize:11,color:t.text3}}>✉ {p.email}</span>}
            </div>
            {p.gap_min>0&&<div style={{fontSize:11,color:'#f59e0b',marginTop:4,fontWeight:500}}>⏳ {p.gap_min}m gap from previous participant</div>}
          </div>
        </div>)}
      </div>:<div style={{textAlign:'center',padding:24,color:t.text3}}>No participant data available</div>}
    </Card>
    {(m.recording_summary||m.summary_content)&&<Card t={t}><CardTitle t={t}>🎬 Recording Summary</CardTitle>
      <div style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:8,padding:16,fontSize:13,color:t.text2,lineHeight:1.7,maxHeight:400,overflowY:'auto',whiteSpace:'pre-wrap'}}>{m.recording_summary||m.summary_content}</div>
    </Card>}
  </>)
}

function Participants({parts,t}){
  const[search,setSearch]=useState('')
  const filtered=(parts.participants||[]).filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||p.email?.toLowerCase().includes(search.toLowerCase()))
  return(<>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
      <div><h2 style={{fontSize:22,fontWeight:700,color:t.text}}>Participants Directory</h2><p style={{fontSize:13,color:t.text3,marginTop:2}}>{parts.total} unique participants across all meetings</p></div>
      <Btn onClick={()=>downloadCSV(filtered.map(p=>({Name:p.name,Email:p.email,Meetings:p.total_meetings,'Total Min':Math.round(p.total_min),'Avg Min':p.avg_min,'First Seen':p.first_seen,'Last Seen':p.last_seen})),'Participants.csv')} t={t} small>📥 Export</Btn>
    </div>
    <Card t={t} style={{marginBottom:14,padding:14}}><Input t={t} placeholder="🔍 Search participants..." value={search} onChange={e=>setSearch(e.target.value)}/></Card>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
      {filtered.map((p,i)=><Card key={i} t={t} style={{display:'flex',alignItems:'center',gap:14,padding:16}}>
        <div style={{width:44,height:44,borderRadius:'50%',background:CL[i%CL.length],display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:16,color:'#fff',flexShrink:0}}>{(p.name||'?')[0].toUpperCase()}</div>
        <div style={{flex:1,minWidth:0}}>
          <h4 style={{fontSize:14,fontWeight:600,color:t.text,margin:0}}>{p.name}</h4>
          <p style={{fontSize:11,color:t.text3,margin:'2px 0'}}>{p.email||'—'}</p>
          <p style={{fontSize:10,color:t.text3}}>First: {p.first_seen||'N/A'} · Last: {p.last_seen||'N/A'}</p>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:22,fontWeight:700,color:t.text}}>{p.total_meetings}</div>
          <div style={{fontSize:10,color:t.text3}}>meetings</div>
          <div style={{fontSize:10,color:t.text3}}>{p.avg_min}m avg · {Math.round(p.total_min)}m total</div>
        </div>
      </Card>)}
    </div>
  </>)
}

function Recordings({recs,onView,t}){
  const[search,setSearch]=useState('')
  const filtered=(recs.recordings||[]).filter(r=>!search||r.topic.toLowerCase().includes(search.toLowerCase())||(r.attendees||[]).some(a=>a.toLowerCase().includes(search.toLowerCase())))
  return(<>
    <div style={{marginBottom:16}}><h2 style={{fontSize:22,fontWeight:700,color:t.text}}>Recordings & Summaries</h2><p style={{fontSize:13,color:t.text3,marginTop:2}}>{recs.total} meetings with AI-generated summaries</p></div>
    <Card t={t} style={{marginBottom:14,padding:14}}><Input t={t} placeholder="🔍 Search recordings..." value={search} onChange={e=>setSearch(e.target.value)}/></Card>
    {filtered.length===0?<div style={{textAlign:'center',padding:60,color:t.text3}}>No recordings found</div>
    :filtered.map((r,i)=><Card key={i} t={t} style={{marginBottom:12,cursor:'pointer'}} onClick={()=>onView(r._idx)}>
      <h4 style={{fontSize:14,fontWeight:600,color:t.text,marginBottom:8}}>🎬 {r.topic}</h4>
      <div style={{display:'flex',gap:16,fontSize:12,color:t.text3,flexWrap:'wrap',marginBottom:8}}>
        <span>📅 {r.date}</span><span>⏱ {r.duration}m</span><span>👥 {r.participants}</span><span>💚 Health: <b style={{color:hc(r.health_score)}}>{r.health_score}</b></span><span>🎤 {r.host}</span>
      </div>
      <div style={{fontSize:11,color:t.text3,marginBottom:8}}>Attendees: {r.attendees.join(', ')}</div>
      {r.summary&&<div style={{background:t.bg,border:`1px solid ${t.border}`,borderRadius:8,padding:12,fontSize:12,color:t.text2,lineHeight:1.6,maxHeight:80,overflow:'hidden'}}>{r.summary.substring(0,250)}...</div>}
    </Card>)}
  </>)
}

function Analytics({stats,t}){
  if(!stats)return null
  return(<>
    <div style={{marginBottom:20}}><h2 style={{fontSize:22,fontWeight:700,color:t.text}}>Advanced Analytics</h2><p style={{fontSize:13,color:t.text3,marginTop:2}}>Deep insights into your meeting patterns and productivity</p></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
      <Card t={t}><CardTitle t={t}>📊 Duration Distribution</CardTitle>
        <ResponsiveContainer width="100%" height={250}><BarChart data={stats.dur_chart}><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis dataKey="range" tick={{fill:t.text3,fontSize:11}}/><YAxis tick={{fill:t.text3,fontSize:10}}/><Tooltip contentStyle={ttStyle(t)}/><Bar dataKey="count" fill="#10b981" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>
      </Card>
      <Card t={t}><CardTitle t={t}>👥 Meeting Size Distribution</CardTitle>
        <ResponsiveContainer width="100%" height={250}><PieChart><Pie data={stats.size_chart} cx="50%" cy="50%" outerRadius={90} dataKey="count" label={({range,count})=>`${range}: ${count}`}>{stats.size_chart.map((e,i)=><Cell key={i} fill={CL[i]}/>)}</Pie><Tooltip contentStyle={ttStyle(t)}/></PieChart></ResponsiveContainer>
      </Card>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
      <Card t={t}><CardTitle t={t}>📅 Day of Week Activity</CardTitle>
        <ResponsiveContainer width="100%" height={250}><BarChart data={stats.dow_chart}><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis dataKey="day" tick={{fill:t.text3,fontSize:11}}/><YAxis tick={{fill:t.text3,fontSize:10}}/><Tooltip contentStyle={ttStyle(t)}/><Bar dataKey="count" fill="#f59e0b" radius={[4,4,0,0]}/></BarChart></ResponsiveContainer>
      </Card>
      <Card t={t}><CardTitle t={t}>🎬 Recording Coverage Over Time</CardTitle>
        <ResponsiveContainer width="100%" height={250}><LineChart data={stats.rec_chart}><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis dataKey="month" tick={{fill:t.text3,fontSize:11}}/><YAxis tick={{fill:t.text3,fontSize:10}} domain={[0,100]} tickFormatter={v=>`${v}%`}/><Tooltip contentStyle={ttStyle(t)} formatter={v=>`${v}%`}/><Line type="monotone" dataKey="rate" stroke="#8b5cf6" strokeWidth={2} dot={{fill:'#8b5cf6'}}/></LineChart></ResponsiveContainer>
      </Card>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:20}}>
      <Card t={t}><CardTitle t={t}>📈 Weekly Trend</CardTitle>
        <ResponsiveContainer width="100%" height={250}><AreaChart data={stats.weekly_chart}><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#2563eb" stopOpacity={.3}/><stop offset="95%" stopColor="#2563eb" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke={t.border}/><XAxis dataKey="week" tick={{fill:t.text3,fontSize:10}} tickFormatter={w=>w.split('-')[1]}/><YAxis tick={{fill:t.text3,fontSize:10}}/><Tooltip contentStyle={ttStyle(t)}/><Area type="monotone" dataKey="meetings" stroke="#2563eb" fill="url(#wg)" strokeWidth={2}/></AreaChart></ResponsiveContainer>
      </Card>
      <Card t={t}><CardTitle t={t}>⏱ Key Metrics Summary</CardTitle>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
          {[
            {l:'Longest Meeting',v:`${stats.max_duration}m`,c:'#ef4444'},
            {l:'Shortest Meeting',v:`${stats.min_duration}m`,c:'#10b981'},
            {l:'Total Hours',v:`${stats.total_hours}h`,c:'#2563eb'},
            {l:'Avg Duration',v:`${stats.avg_duration_minutes}m`,c:'#f59e0b'},
            {l:'Recording Rate',v:`${Math.round(stats.meetings_with_recordings/stats.total_meetings*100)}%`,c:'#8b5cf6'},
            {l:'Avg Health',v:`${stats.avg_health_score}/100`,c:hc(stats.avg_health_score)},
          ].map((m,i)=><div key={i} style={{background:t.bg,borderRadius:8,padding:14,textAlign:'center'}}>
            <div style={{fontSize:22,fontWeight:800,color:m.c}}>{m.v}</div>
            <div style={{fontSize:10,color:t.text3,marginTop:4}}>{m.l}</div>
          </div>)}
        </div>
      </Card>
    </div>
  </>)
}

export default App
