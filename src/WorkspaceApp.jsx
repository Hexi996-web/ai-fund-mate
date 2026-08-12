import { useState } from 'react'
import FundApp from './App.jsx'
import { ThemeWorkspace } from './components/ThemeWorkspace.jsx'
import './workspace.css'
export default function WorkspaceApp(){const[workspace,setWorkspace]=useState('themes');return <><nav className="workspace-nav" aria-label="产品工作区"><div className="workspace-nav__inner"><strong>AI Fund Mate</strong><div><button type="button" className={workspace==='themes'?'active':''} onClick={()=>setWorkspace('themes')}>五主题研判</button><button type="button" className={workspace==='funds'?'active':''} onClick={()=>setWorkspace('funds')}>基金产品库</button></div></div></nav>{workspace==='themes'?<main className="workspace-main"><ThemeWorkspace/></main>:<FundApp/>}</>}
