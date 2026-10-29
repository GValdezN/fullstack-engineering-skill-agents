"use client";
import { useEffect, useState } from 'react';
export default function Page(){
 const [text,setText]=useState(''); const [notes,setNotes]=useState([]); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/notes');if(!r.ok)throw new Error('No se pudieron cargar las notas');setNotes(await r.json());}
 useEffect(()=>{load().catch(e=>setError(e.message))},[]);
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/notes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text})});if(!r.ok)throw new Error('No se pudo guardar');setText('');await load();}catch(e){setError(e.message)}finally{setBusy(false)}}
 return <main><h1>Notas de prueba</h1><form onSubmit={save}><label>Nota<input value={text} onChange={e=>setText(e.target.value)} required maxLength={200}/></label><button disabled={busy}>Guardar</button></form>{error&&<p role="alert">{error}</p>}<ul>{notes.map(n=><li key={n.id}>{n.text}</li>)}</ul></main>;
}
