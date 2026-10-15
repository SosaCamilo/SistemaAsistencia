import type { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { Role } from "@/lib/roles";
import {
  RATE_LIMIT_CONFIG,
  minutesLocked,
  registerFailure,
  registerSuccess,
} from "@/lib/loginRateLimit";
import { syncClassHolidays } from "@/lib/holidaysSync";

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        dni: { label: "DNI", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const dni = credentials?.dni?.trim();
        const password = credentials?.password ?? "";
        if (!dni || !password) return null;

        // Si el DNI está bloqueado por intentos fallidos, no se evalúa la
        // contraseña. El mensaje se lanza como Error para que la pantalla de
        // login pueda explicar por qué no entra.
        const locked = minutesLocked(dni);
        if (locked > 0) {
          throw new Error(
            `Demasiados intentos fallidos. Volvé a probar en ${locked} ${locked === 1 ? "minuto" : "minutos"}.`
          );
        }

        const user = await prisma.user.findUnique({ where: { dni } });
        if (!user || !user.active) {
          registerFailure(dni);
          await logAudit({ action: "LOGIN_FAILED", details: `DNI ${dni}` });
          return null;
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) {
          const blocked = registerFailure(dni);
          await logAudit({
            actorId: user.id,
            action: blocked ? "LOGIN_BLOCKED" : "LOGIN_FAILED",
            details: blocked
              ? `Bloqueado ${RATE_LIMIT_CONFIG.LOCK_MINUTES} minutos tras ${RATE_LIMIT_CONFIG.MAX_ATTEMPTS} intentos fallidos`
              : null,
          });
          if (blocked) {
            throw new Error(
              `Demasiados intentos fallidos. Volvé a probar en ${RATE_LIMIT_CONFIG.LOCK_MINUTES} minutos.`
            );
          }
          return null;
        }

        registerSuccess(dni);
        await logAudit({ actorId: user.id, action: "LOGIN" });

        // Sincronización automática de feriados en segundo plano (con mutex y cooldown)
        void syncClassHolidays(user.id).catch((err) => {
          console.error("[auth] Error en sincronización automática de feriados al iniciar sesión:", err);
        });

        return {
          id: user.id,
          dni: user.dni,
          nombre: user.nombre,
          apellido: user.apellido,
          role: user.role as Role,
          selfPasswordChangeUsed: user.selfPasswordChangeUsed,
        };
      },
    }),
  ],
  events: {
    async signIn({ user }) {
      void syncClassHolidays(user.id).catch((err) => {
        console.error("[auth] Error en evento signIn al sincronizar feriados:", err);
      });
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = (user as any).id;
        token.dni = (user as any).dni;
        token.nombre = (user as any).nombre;
        token.apellido = (user as any).apellido;
        token.role = (user as any).role;
        token.selfPasswordChangeUsed = (user as any).selfPasswordChangeUsed;
      }
      if (trigger === "update") {
        // Refresca el flag de cambio de contraseña tras completarse la accion.
        const fresh = await prisma.user.findUnique({ where: { id: token.id as string } });
        if (fresh) token.selfPasswordChangeUsed = fresh.selfPasswordChangeUsed;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).dni = token.dni;
        (session.user as any).nombre = token.nombre;
        (session.user as any).apellido = token.apellido;
        (session.user as any).role = token.role;
        (session.user as any).selfPasswordChangeUsed = token.selfPasswordChangeUsed;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
