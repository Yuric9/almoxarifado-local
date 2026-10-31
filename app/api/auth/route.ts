import { cookies } from 'next/headers'
import { falha, lerJson, ok } from '@/lib/api'
import {
  COOKIE_SESSAO, PERFIS, administradores, criarPrimeiroAdministrador, entrar, exigir, redefinirSenhaAdministrador,
  sair, situacaoAcesso, trocarMinhaSenha, usuarioDaSessao
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Quem está logado e em que situação está o acesso (criar administrador, recuperar senha ou login). */
export function GET() {
  try {
    const situacao = situacaoAcesso()
    const usuario = situacao === 'login' ? usuarioDaSessao(cookies().get(COOKIE_SESSAO)?.value) : null
    return ok({ situacao, usuario, perfis: PERFIS, administradores: situacao === 'redefinir' ? administradores() : [] })
  } catch (e) {
    return falha(e, 500)
  }
}

function guardarSessao(token: string, maxAge: number) {
  cookies().set(COOKIE_SESSAO, token, { httpOnly: true, sameSite: 'strict', path: '/', maxAge })
}

/** acao: entrar | sair | primeiro-acesso | redefinir | trocar-senha */
export async function POST(req: Request) {
  try {
    const body = await lerJson(req)
    switch (body.acao) {
      case 'entrar': {
        try {
          const { token, maxAge } = entrar(body.login, body.senha)
          guardarSessao(token, maxAge)
        } catch (e) {
          // Atraso pequeno a cada erro: dificulta tentar senhas em sequência.
          await new Promise(r => setTimeout(r, 600))
          throw e
        }
        return ok({ ok: true })
      }
      case 'sair':
        sair(cookies().get(COOKIE_SESSAO)?.value)
        cookies().delete(COOKIE_SESSAO)
        return ok({ ok: true })
      case 'primeiro-acesso': {
        criarPrimeiroAdministrador({ nome: body.nome, login: body.login, senha: body.senha })
        const { token, maxAge } = entrar(body.login, body.senha)
        guardarSessao(token, maxAge)
        return ok({ ok: true }, 201)
      }
      case 'redefinir':
        redefinirSenhaAdministrador({ login: body.login, senha: body.senha })
        return ok({ ok: true })
      case 'trocar-senha': {
        const usuario = exigir('leitura')
        trocarMinhaSenha(usuario.id, body.senha_atual, body.senha_nova)
        return ok({ ok: true })
      }
      default:
        throw new Error('Ação inválida')
    }
  } catch (e) {
    return falha(e)
  }
}
