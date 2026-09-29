import { NextResponse } from 'next/server'
import { obterRequisicao } from '@/lib/repository'

export const runtime='nodejs'

export async function GET(_req:Request,{params}:{params:{id:string}}) {
  try {
    return NextResponse.json(obterRequisicao(Number(params.id)))
  } catch(e) {
    return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:404})
  }
}
