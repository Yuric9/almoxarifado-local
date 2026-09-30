import { NextResponse } from 'next/server'
import { listarMovimentacoes, registrarMovimentacao } from '@/lib/repository'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(listarMovimentacoes())
}

export async function POST(req:Request) {
  try {
    const body=await req.json()
    registrarMovimentacao({
      produto_id:Number(body.produto_id),
      tipo:body.tipo,
      quantidade:Number(body.quantidade),
      responsavel:body.responsavel,
      observacao:body.observacao,
      requisicao_id:body.requisicao_id ? Number(body.requisicao_id) : undefined,
      origem:body.origem
    })
    return NextResponse.json({ok:true})
  } catch (e) {
    return NextResponse.json({error:e instanceof Error?e.message:'Erro interno'},{status:400})
  }
}
