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
  const [backupStatus,setBackupStatus]=useState('')
  const [showRequisicao,setShowRequisicao]=useState(false)
  const [requisicoes,setRequisicoes]=useState<any[]>([])
  const [requisicao,setRequisicao]=useState<any>({retirado_por:'',setor:'',finalidade:'',entregue_por:'',observacao:'',itens:[{produto_id:'',quantidade:''}]})
  const [requisicaoCriada,setRequisicaoCriada]=useState<any>(null)

  async function fazerBackup(){
    try{
      const res=await fetch('/api/backup')
      if(!res.ok) throw new Error('Não foi possível gerar o backup')
      const blob=await res.blob(); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='almoxarifado-backup.db'; a.click(); URL.revokeObjectURL(url); setBackupStatus('Backup gerado com sucesso'); setTimeout(()=>setBackupStatus(''),3000)
    }catch(e){setBackupStatus(e instanceof Error?e.message:'Erro no backup')}
  }

  async function carregarRequisicoes(){ const res=await fetch('/api/requisicoes'); if(res.ok) setRequisicoes(await res.json()) }
  useEffect(()=>{ carregarRequisicoes() },[])

  function adicionarItemRequisicao(){ setRequisicao((r:any)=>({...r,itens:[...r.itens,{produto_id:'',quantidade:''}]})) }
  function removerItemRequisicao(index:number){ setRequisicao((r:any)=>({...r,itens:r.itens.filter((_:any,i:number)=>i!==index)})) }
  function atualizarItemRequisicao(index:number,campo:string,valor:any){ setRequisicao((r:any)=>({...r,itens:r.itens.map((item:any,i:number)=>i===index?{...item,[campo]:valor}:item)})) }

  async function criarRequisicao(){
    try{
      const itens=requisicao.itens.filter((i:any)=>i.produto_id && Number(i.quantidade)>0).map((i:any)=>({produto_id:Number(i.produto_id),quantidade:Number(i.quantidade)}))
      const res=await fetch('/api/requisicoes',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...requisicao,itens})})
      const data=await res.json()
      if(!res.ok) throw new Error(data.error||'Não foi possível registrar a retirada')
      const detalhe=await fetch('/api/requisicoes/'+data.id).then(r=>r.json())
      setRequisicaoCriada(detalhe)
      setRequisicao({retirado_por:'',setor:'',finalidade:'',entregue_por:'',observacao:'',itens:[{produto_id:'',quantidade:''}]})
      const [p,m]=await Promise.all([fetch('/api/produtos').then(r=>r.json()),fetch('/api/movimentacoes').then(r=>r.json())])
      setProdutos(p);setMovs(m);await carregarRequisicoes();notify('✅ Retirada registrada: '+detalhe.numero)
    }catch(e){notify('❌ '+(e instanceof Error?e.message:'Erro ao registrar retirada'))}
  }

  function imprimirRequisicao(){ window.print() }

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

      <div className="flex flex-wrap justify-end gap-2 mb-4">
        <button onClick={()=>{setRequisicaoCriada(null);setShowRequisicao(true)}} className="px-4 py-2 rounded-xl bg-orange-600 text-white font-bold">📝 Nova retirada</button>
        <button onClick={fazerBackup} className="px-4 py-2 rounded-xl border-2 border-zinc-200 bg-white font-semibold hover:bg-zinc-50">💾 Fazer backup</button></div>
      {requisicoes.length>0 && <div className="mb-6 bg-white rounded-[20px] border p-5">
        <div className="flex items-center justify-between mb-3"><h3 className="text-xl font-bold">Últimas requisições de retirada</h3><button onClick={()=>setShowRequisicao(true)} className="text-blue-600 font-bold">Nova retirada</button></div>
        <div className="space-y-2">{requisicoes.slice(0,5).map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b last:border-0 py-3">
          <div><p className="font-bold">{r.numero} · {r.retirado_por}</p><p className="text-sm text-zinc-500">{r.setor||'Sem setor'} · {new Date(r.criado_em).toLocaleString('pt-BR')} · {r.total_itens} item(ns)</p></div>
          <button onClick={async()=>setRequisicaoCriada(await fetch('/api/requisicoes/'+r.id).then(x=>x.json()))} className="px-3 py-2 rounded-lg border font-semibold">Ver comprovante</button>
        </div>)}</div>
      </div>}
      {backupStatus && <div className="mb-4 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3">{backupStatus}</div>}

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


      {showRequisicao && <div className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center p-4 z-50">
        <div className="bg-white rounded-[28px] w-full max-w-3xl p-6 md:p-8 max-h-[92vh] overflow-auto">
          <div className="flex justify-between items-start gap-4 mb-6"><div><h2 className="text-2xl font-black">📝 Requisição de Material</h2><p className="text-zinc-500">Registre quem retirou e quais materiais foram entregues.</p></div><button onClick={()=>setShowRequisicao(false)} className="text-2xl">×</button></div>
          <div className="grid md:grid-cols-2 gap-3 mb-5">
            <input placeholder="Nome de quem retirou *" value={requisicao.retirado_por} onChange={e=>setRequisicao({...requisicao,retirado_por:e.target.value})} className="h-13 border-2 rounded-xl px-4"/>
            <input placeholder="Setor / departamento" value={requisicao.setor} onChange={e=>setRequisicao({...requisicao,setor:e.target.value})} className="h-13 border-2 rounded-xl px-4"/>
            <input placeholder="Finalidade da retirada" value={requisicao.finalidade} onChange={e=>setRequisicao({...requisicao,finalidade:e.target.value})} className="h-13 border-2 rounded-xl px-4"/>
            <input placeholder="Entregue por" value={requisicao.entregue_por} onChange={e=>setRequisicao({...requisicao,entregue_por:e.target.value})} className="h-13 border-2 rounded-xl px-4"/>
          </div>
          <h3 className="font-bold text-lg mb-3">Materiais retirados</h3>
          <div className="space-y-3">{requisicao.itens.map((item:any,index:number)=><div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2">
            <select value={item.produto_id} onChange={e=>atualizarItemRequisicao(index,'produto_id',e.target.value)} className="h-13 border-2 rounded-xl px-3"><option value="">Selecione o material</option>{produtos.map(p=><option key={p.id} value={p.id}>{p.nome} — disponível: {p.quantidade_atual} {p.unidade}</option>)}</select>
            <input type="number" min="0.01" placeholder="Qtd." value={item.quantidade} onChange={e=>atualizarItemRequisicao(index,'quantidade',e.target.value)} className="h-13 border-2 rounded-xl px-3"/>
            <button onClick={()=>removerItemRequisicao(index)} disabled={requisicao.itens.length===1} className="px-3 rounded-xl border text-red-600 disabled:opacity-30">Remover</button>
          </div>)}</div>
          <button onClick={adicionarItemRequisicao} className="mt-3 text-blue-600 font-bold">+ Adicionar outro material</button>
          <textarea placeholder="Observação (opcional)" value={requisicao.observacao} onChange={e=>setRequisicao({...requisicao,observacao:e.target.value})} className="w-full border-2 rounded-xl p-3 mt-5 min-h-20"/>
          <div className="flex gap-3 mt-5"><button onClick={()=>setShowRequisicao(false)} className="flex-1 h-13 rounded-xl border-2 font-bold">Cancelar</button><button onClick={criarRequisicao} className="flex-1 h-13 rounded-xl bg-orange-600 text-white font-bold">Confirmar retirada</button></div>
        </div>
      </div>}

      {requisicaoCriada && <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-[20px] w-full max-w-2xl p-8 print:shadow-none">
          <div className="text-center border-b pb-4 mb-5"><h2 className="text-2xl font-black">ALMOXARIFADO LOCAL</h2><p className="font-bold text-lg">COMPROVANTE DE RETIRADA</p><p className="text-zinc-500">{requisicaoCriada.numero}</p></div>
          <div className="grid grid-cols-2 gap-3 text-sm mb-5"><p><b>Retirado por:</b> {requisicaoCriada.retirado_por}</p><p><b>Setor:</b> {requisicaoCriada.setor||'—'}</p><p><b>Data:</b> {new Date(requisicaoCriada.criado_em).toLocaleString('pt-BR')}</p><p><b>Entregue por:</b> {requisicaoCriada.entregue_por||'—'}</p></div>
          <table className="w-full border-collapse mb-5"><thead><tr className="border-b-2 text-left"><th className="py-2">Material</th><th className="py-2">Qtd.</th><th className="py-2">Un.</th></tr></thead><tbody>{requisicaoCriada.itens.map((i:any)=><tr key={i.id} className="border-b"><td className="py-2">{i.produto_nome}</td><td className="py-2">{i.quantidade}</td><td className="py-2">{i.unidade}</td></tr>)}</tbody></table>
          {requisicaoCriada.finalidade && <p className="mb-3"><b>Finalidade:</b> {requisicaoCriada.finalidade}</p>}
          {requisicaoCriada.observacao && <p className="mb-6"><b>Observação:</b> {requisicaoCriada.observacao}</p>}
          <div className="grid grid-cols-2 gap-10 mt-10 text-center text-sm"><div className="border-t pt-2">Assinatura de quem retirou</div><div className="border-t pt-2">Assinatura do responsável</div></div>
          <div className="flex gap-3 mt-8 print:hidden"><button onClick={()=>setRequisicaoCriada(null)} className="flex-1 h-12 rounded-xl border-2 font-bold">Fechar</button><button onClick={imprimirRequisicao} className="flex-1 h-12 rounded-xl bg-zinc-900 text-white font-bold">🖨️ Imprimir</button></div>
        </div>
      </div>}
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
