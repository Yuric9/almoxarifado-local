'use client'
import { createContext, useContext } from 'react'
import type { Perfil, Usuario } from '@/lib/tipos'

/**
 * Usuário logado, disponível para qualquer tela.
 * Serve só para esconder botões que o perfil não pode usar: quem garante a regra é o servidor.
 */
export const UsuarioContexto = createContext<Usuario | null>(null)

export function useUsuario() {
  return useContext(UsuarioContexto)
}

const NIVEIS: Record<'operacao' | 'admin', Perfil[]> = {
  operacao: ['ADMIN', 'ALMOXARIFE'],
  admin: ['ADMIN']
}

/** true se o usuário logado pode fazer operações desse nível. */
export function usePode(nivel: 'operacao' | 'admin') {
  const usuario = useUsuario()
  return !!usuario && NIVEIS[nivel].includes(usuario.perfil)
}
