import { falha, ok } from '@/lib/api'
import { backupAutomaticoDiario } from '@/lib/backup'
import { arquivoBanco, pastaDados } from '@/lib/paths'
import pacote from '@/package.json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Informações exibidas no rodapé. Também dispara o backup automático do dia. */
export function GET() {
  try {
    let backupAutomatico: string | null = null
    try {
      backupAutomatico = backupAutomaticoDiario()
    } catch (e) {
      console.error('Falha no backup automático', e)
    }
    return ok({
      versao: pacote.version,
      modo: process.env.ALMOXARIFADO_MODO || 'desenvolvimento',
      pasta_dados: pastaDados(),
      banco: arquivoBanco(),
      backup_automatico: backupAutomatico
    })
  } catch (e) {
    return falha(e, 500)
  }
}
