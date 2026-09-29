import { NextResponse } from 'next/server'
import { cancelarReserva, obterReserva } from '@/lib/repository'
export const runtime='nodejs'
export async function GET(_req:Request,{params}:{params:{id:string}}){ try{return NextResponse.json(obterReserva(Number(params.id)))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:404})} }
export async function DELETE(_req:Request,{params}:{params:{id:string}}){ try{cancelarReserva(Number(params.id));return NextResponse.json({ok:true})}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Erro'},{status:400})} }
