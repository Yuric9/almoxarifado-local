import { NextResponse } from 'next/server'
import { atualizarStatusReserva, cancelarReserva, obterReserva, retirarReserva } from '@/lib/repository'
export const runtime='nodejs'
export async function GET(_req:Request,{params}:{params:{id:string}}){ try{return NextResponse.json(obterReserva(Number(params.id)))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:404})} }
export async function DELETE(_req:Request,{params}:{params:{id:string}}){ try{cancelarReserva(Number(params.id));return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:400})} }

export async function POST(req:Request,{params}:{params:{id:string}}){ try{ const body=await req.json(); const requisicaoId=retirarReserva(Number(params.id),body.retirado_por); return NextResponse.json({ok:true,requisicao_id:requisicaoId}) }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:400})} }

export async function PATCH(req:Request,{params}:{params:{id:string}}){ try{const body=await req.json(); atualizarStatusReserva(Number(params.id),body.status); return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:400})} }
