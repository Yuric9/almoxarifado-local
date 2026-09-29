import { NextResponse } from 'next/server'
import fs from 'node:fs/promises'
import path from 'node:path'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET() {
  const dataDir = process.env.ALMOXARIFADO_DATA_DIR || path.join(process.cwd(),'data')
  const file = path.join(dataDir,'almoxarifado.db')
  try {
    await fs.access(file)
    const backupFile = path.join(dataDir, `almoxarifado-backup-${Date.now()}.db`)
    await db.backup(backupFile)
    const data = await fs.readFile(backupFile)
    await fs.rm(backupFile, { force:true })
    return new NextResponse(data,{
      headers:{
        'Content-Type':'application/octet-stream',
        'Content-Disposition':'attachment; filename="almoxarifado-backup.db"',
        'Cache-Control':'no-store'
      }
    })
  } catch (e) {
    return NextResponse.json(
      {error:e instanceof Error ? e.message : 'Não foi possível gerar o backup'},
      {status:404}
    )
  }
}
