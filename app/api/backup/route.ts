import fs from 'node:fs'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { falha, ok } from '@/lib/api'
import { criarBackup, listarBackups } from '@/lib/backup'
import { pastaBackups } from '@/lib/paths'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Lista os backups ou baixa um deles (?arquivo=nome.db). */
export function GET(req: Request) {
  try {
    const arquivo = new URL(req.url).searchParams.get('arquivo')
    if (!arquivo) return ok({ pasta: pastaBackups(), backups: listarBackups() })

    const nome = path.basename(arquivo)
    if (nome !== arquivo || !nome.endsWith('.db')) throw new Error('Arquivo inválido')
    const caminho = path.join(pastaBackups(), nome)
    if (!fs.existsSync(caminho)) return falha(new Error('Backup não encontrado'), 404)

    return new NextResponse(fs.readFileSync(caminho), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${nome}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (e) {
    return falha(e)
  }
}

/** Cria um backup na pasta de dados (no HD, na versão portátil). */
export function POST() {
  try {
    const caminho = criarBackup('manual')
    return ok({ ok: true, arquivo: path.basename(caminho), pasta: pastaBackups() }, 201)
  } catch (e) {
    return falha(e, 500)
  }
}
