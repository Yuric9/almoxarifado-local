import { NextResponse } from 'next/server'
import fs from 'node:fs'
import path from 'node:path'

export const runtime = 'nodejs'

export async function GET() {
  const dataDir = process.env.ALMOXARIFADO_DATA_DIR || path.join(process.cwd(),'data')
  const file = path.join(dataDir,'almoxarifado.db')
  if (!fs.existsSync(file)) return NextResponse.json({error:'Banco ainda não foi criado'},{status:404})
  const data=fs.readFileSync(file)
  return new NextResponse(data,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="almoxarifado.db"' }})
}
