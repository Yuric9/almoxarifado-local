import { NextResponse } from 'next/server'
import { criarProduto, listarProdutos } from '@/lib/repository'

export const runtime = 'nodejs'
export async function GET() { return NextResponse.json(listarProdutos()) }
export async function POST(req:Request) {
  try {
    const body=await req.json()
    if (!body.nome) return NextResponse.json({error:'Nome é obrigatório'},{status:400})
    criarProduto({nome:body.nome,categoria_id:body.categoria_id ?? null,quantidade:Number(body.quantidade||0),minimo:Number(body.minimo||5),unidade:body.unidade||'UN'})
    return NextResponse.json({ok:true})
  } catch (e) { return NextResponse.json({error:e instanceof Error?e.message:'Erro interno'},{status:500}) }
}
