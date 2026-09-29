import { NextResponse } from 'next/server'
import { criarRequisicao, listarRequisicoes } from '@/lib/repository'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(listarRequisicoes())
}

export async function POST(req:Request) {
  try {
    const body = await req.json()
    const id = criarRequisicao({
      retirado_por: body.retirado_por,
      setor: body.setor,
      finalidade: body.finalidade,
      entregue_por: body.entregue_por,
      observacao: body.observacao,
      itens: Array.isArray(body.itens) ? body.itens.map((item:any)=>({
        produto_id:Number(item.produto_id),
        quantidade:Number(item.quantidade)
      })) : []
    })
    return NextResponse.json({ ok:true, id })
  } catch (e) {
    return NextResponse.json({ error:e instanceof Error ? e.message : 'Não foi possível criar a requisição' }, { status:400 })
  }
}
