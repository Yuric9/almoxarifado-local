'use client'
import { useState, useEffect } from 'react'

type Produto = { id:string, nome:string, categoria_id?:string, quantidade_atual:number, estoque_minimo:number, unidade:string, categoria?:string }
type Mov = { id:string, produto_id:string, tipo:'ENTRADA'|'SAIDA', quantidade:number, responsavel?:string, observacao?:string, criado_em:string, produto_nome?:string }

const CATS = ['Ferramentas','Elétrica','Hidráulica','Limpeza','Geral']

export default function Home(){
  const [produtos,setProdutos]=useState<Produto[]>([])
  const [movs,setMovs]=useState<Mov[]>([])
  const [carregando,setCarregando]=useState(true)

  useEffect(()=>{
    Promise.all([fetch('/api/produtos').then(r=>r.json()),fetch('/api/movimentacoes').then(r=>r.json())])
      .then(([p,m])=>{setProdutos(p);setMovs(m)})
      .finally(()=>setCarregando(false))
  },[])
  const [busca,setBusca]=useState('')
  const [catFiltro,setCatFiltro]=useState('Todas')
  const [showEntrada,setShowEntrada]=useState(false)
  const [showSaida,setShowSaida]=useState(false)
  const [showNovo,setShowNovo]=useState(false)
  const [form,setForm]=useState<any>({})
  const [toast,setToast]=useState('')

  const alerta = produtos.filter(p=>p.quantidade_atual <= p.estoque_minimo)
  const filtrados = produtos.filter(p=> (catFiltro==='Todas' || p.categoria===catFiltro) && p.nome.toLowerCase().includes(busca.toLowerCase()))

  function notify(msg:string){ setToast(msg); setTimeout(()=>setToast(''),3000) }

  async function registrar(tipo:'ENTRADA'|'SAIDA'){
    const prod = produtos.find(p=>String(p.id)===String(form.produto_id))
    if(!prod) return
    try {
      const res=await fetch('/api/movimentacoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({produto_id:Number(form.produto_id),tipo,quantidade:Number(form.quantidade),responsavel:form.responsavel,observacao:form.observacao})})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error||'Não foi possível registrar')
      const [p,m]=await Promise.all([fetch('/api/produtos').then(r=>r.json()),fetch('/api/movimentacoes').then(r=>r.json())])
      setProdutos(p);setMovs(m);notify(tipo==='ENTRADA' ? '✅ Entrada registrada' : '📦 Saída registrada');setShowEntrada(false);setShowSaida(false);setForm({})
    } catch(e){ notify('❌ '+(e instanceof Error?e.message:'Erro ao registrar')) }
  }

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-4 md:p-8">
      <header className="flex flex-col md:flex-row justify-between gap-4 mb-8">
        <div><h1 className="text-3xl font-black tracking-tight">Almoxarifado Simples</h1><p className="text-zinc-500 text-lg">Fácil para qualquer idade usar</p></div>
        <div className="relative flex-1 max-w-md">
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="🔍 Buscar material... ex: parafuso" className="w-full h-14 rounded-2xl border-2 border-zinc-200 px-6 text-lg focus:border-blue-500 outline-none"/>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-[24px] p-6 shadow-sm border"><p className="text-zinc-500 text-lg">Total de Itens</p><p className="text-4xl font-bold">{produtos.length}</p></div>
        <div className="bg-red-50 rounded-[24px] p-6 shadow-sm border border-red-200"><p className="text-red-700 text-lg">Em Alerta</p><p className="text-4xl font-bold text-red-600">{alerta.length}</p></div>
        <div className="bg-blue-50 rounded-[24px] p-6 shadow-sm border border-blue-200"><p className="text-blue-700 text-lg">Movimentações Hoje</p><p className="text-4xl font-bold text-blue-700">{movs.filter(m=> new Date(m.criado_em).toDateString()===new Date().toDateString()).length}</p></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <button onClick={()=>setShowEntrada(true)} className="h-[84px] bg-[#16A34A] hover:bg-green-700 text-white rounded-[20px] text-xl font-bold shadow-lg flex items-center justify-center gap-3">⬇️ ENTRAR Material</button>
        <button onClick={()=>setShowSaida(true)} className="h-[84px] bg-[#EA580C] hover:bg-orange-700 text-white rounded-[20px] text-xl font-bold shadow-lg flex items-center justify-center gap-3">⬆️ TIRAR Material</button>
      </div>

      {alerta.length>0 && <div className="bg-white border-2 border-red-200 rounded-[20px] p-5 mb-8"><h3 className="font-bold text-red-700 text-lg mb-3">⚠️ Precisa repor:</h3><div className="flex flex-wrap gap-2">{alerta.map(a=><span key={a.id} className="bg-red-100 text-red-800 px-4 py-2 rounded-full font-semibold">{a.nome} - só {a.quantidade_atual} {a.unidade}</span>)}</div></div>}

      <div className="flex gap-2 overflow-auto pb-2 mb-4">
        {['Todas',...CATS].map(c=><button key={c} onClick={()=>setCatFiltro(c)} className={`px-5 py-2.5 rounded-full text-base font-semibold whitespace-nowrap border-2 ${catFiltro===c ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200'}`}>{c}</button>)}
        <button onClick={()=>setShowNovo(true)} className="ml-auto px-5 py-2.5 rounded-full bg-blue-600 text-white font-bold">+ Novo Produto</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtrados.map(p=>{
          const pct = Math.min(100, (p.quantidade_atual / Math.max(p.estoque_minimo*2,1))*100)
          const low = p.quantidade_atual <= p.estoque_minimo
          return <div key={p.id} className={`bg-white rounded-[20px] p-5 border-2 shadow-sm ${low ? 'border-red-200' : 'border-zinc-100'}`}>
            <div className="flex justify-between"><span className="text-xs font-bold px-3 py-1 rounded-full bg-zinc-100">{p.categoria}</span><span className={`text-xs font-bold ${low?'text-red-600':'text-green-600'}`}>{low?'ALERTA':'OK'}</span></div>
            <h3 className="text-xl font-bold mt-3">{p.nome}</h3>
            <p className="text-3xl font-black mt-2">{p.quantidade_atual} <span className="text-lg font-normal text-zinc-500">{p.unidade}</span></p>
            <div className="h-2 bg-zinc-100 rounded-full mt-3"><div className={`h-2 rounded-full ${low?'bg-red-500':'bg-green-500'}`} style={{width:`${pct}%`}}></div></div>
            <p className="text-sm text-zinc-500 mt-2">Mínimo: {p.estoque_minimo} {p.unidade}</p>
          </div>
        })}
      </div>

      {movs.length>0 && <div className="mt-10 bg-white rounded-[20px] p-6 border"><h3 className="text-xl font-bold mb-4">Histórico Recente</h3><div className="space-y-3">{movs.slice(0,8).map(m=><div key={m.id} className="flex gap-3 items-center"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${m.tipo==='ENTRADA'?'bg-green-600':'bg-orange-600'}`}>{m.tipo==='ENTRADA'?'↓':'↑'}</div><div><p className="font-semibold">{m.tipo} - {m.produto_nome} - {m.quantidade} UN</p><p className="text-sm text-zinc-500">{m.responsavel} • {new Date(m.criado_em).toLocaleString('pt-BR')}</p></div></div>)}</div></div>}

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white px-8 py-4 rounded-full text-lg font-bold shadow-2xl">{toast}</div>}

      {(showEntrada||showSaida) && <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-4 z-50">
        <div className="bg-white rounded-[28px] w-full max-w-lg p-8">
          <h2 className="text-2xl font-black mb-6">{showEntrada?'⬇️ Entrada de Material':'⬆️ Saída de Material'}</h2>
          <label className="block text-lg font-semibold mb-2">Qual material?</label>
          <select value={form.produto_id||''} onChange={e=>setForm({...form,produto_id:e.target.value})} className="w-full h-14 border-2 rounded-xl px-4 text-lg mb-4">
            <option value="">Selecione...</option>{produtos.map(p=><option key={p.id} value={p.id}>{p.nome} (tem {p.quantidade_atual})</option>)}
          </select>
          <label className="block text-lg font-semibold mb-2">Quantidade</label>
          <input type="number" value={form.quantidade||''} onChange={e=>setForm({...form,quantidade:e.target.value})} className="w-full h-14 border-2 rounded-xl px-4 text-lg mb-4" placeholder="Ex: 10"/>
          <label className="block text-lg font-semibold mb-2">{showEntrada?'Observação (opcional)':'Quem retirou?'}</label>
          <input value={showEntrada?form.observacao||'':form.responsavel||''} onChange={e=>setForm({...form,[showEntrada?'observacao':'responsavel']:e.target.value})} className="w-full h-14 border-2 rounded-xl px-4 text-lg mb-6" placeholder={showEntrada?'Ex: Nota fiscal 123':'Ex: João da Manutenção'}/>
          <div className="flex gap-3"><button onClick={()=>{setShowEntrada(false);setShowSaida(false)}} className="flex-1 h-14 rounded-xl border-2 font-bold text-lg">Cancelar</button><button onClick={()=>registrar(showEntrada?'ENTRADA':'SAIDA')} className={`flex-1 h-14 rounded-xl font-bold text-lg text-white ${showEntrada?'bg-green-600':'bg-orange-600'}`}>Confirmar</button></div>
        </div>
      </div>}

      {showNovo && <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-4 z-50">
        <div className="bg-white rounded-[28px] w-full max-w-lg p-8">
          <h2 className="text-2xl font-black mb-6">+ Novo Produto</h2>
          <input placeholder="Nome do Item - ex: Fita Isolante" value={form.nome||''} onChange={e=>setForm({...form,nome:e.target.value})} className="w-full h-14 border-2 rounded-xl px-4 text-lg mb-3"/>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <select value={form.categoria||''} onChange={e=>setForm({...form,categoria:e.target.value})} className="h-14 border-2 rounded-xl px-4 text-lg"><option>Categoria</option>{CATS.map(c=><option key={c}>{c}</option>)}</select>
            <select value={form.unidade||'UN'} onChange={e=>setForm({...form,unidade:e.target.value})} className="h-14 border-2 rounded-xl px-4 text-lg"><option>UN</option><option>KG</option><option>CX</option><option>PAR</option><option>L</option><option>M</option></select>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <input type="number" placeholder="Qtd Inicial" value={form.qtd||''} onChange={e=>setForm({...form,qtd:e.target.value})} className="h-14 border-2 rounded-xl px-4 text-lg"/>
            <input type="number" placeholder="Mínimo alerta" value={form.min||''} onChange={e=>setForm({...form,min:e.target.value})} className="h-14 border-2 rounded-xl px-4 text-lg"/>
          </div>
          <div className="flex gap-3"><button onClick={()=>setShowNovo(false)} className="flex-1 h-14 rounded-xl border-2 font-bold text-lg">Cancelar</button><button onClick={async()=>{ if(!form.nome) return; try { const res=await fetch('/api/produtos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome:form.nome,quantidade:Number(form.qtd||0),minimo:Number(form.min||5),unidade:form.unidade||'UN'})}); const data=await res.json(); if(!res.ok) throw new Error(data.error||'Erro'); setProdutos(await fetch('/api/produtos').then(r=>r.json())); setShowNovo(false); setForm({}); notify('✅ Produto criado!') } catch(e){notify('❌ '+(e instanceof Error?e.message:'Erro'))}} className="flex-1 h-14 rounded-xl bg-zinc-900 text-white font-bold text-lg">Salvar</button></div>
        </div>
      </div>}
    </div>
  )
}
