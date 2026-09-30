import { NextResponse } from 'next/server'
import { criarReserva, listarReservas } from '@/lib/repository'
export const runtime='nodejs'
export async function GET(){ return NextResponse.json(listarReservas()) }
export async function POST(req:Request){ try { const body=await req.json(); const id=criarReserva({finalidade:body.finalidade,reservado_por:body.reservado_por,observacao:body.observacao,itens:body.itens}); return NextResponse.json({ok:true,id}) } catch(e){ return NextResponse.json({error:e instanceof Error?e.message:'Erro interno'},{status:400}) } }
