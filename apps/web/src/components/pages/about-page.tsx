import {
  Apple,
  BookOpen,
  Download,
  HelpCircle,
  History,
  Info,
  Lightbulb,
  Smartphone,
  Sparkles,
} from "lucide-react"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

/**
 * "Sobre" page — the in-app guide to ScoutBangers. Mounted at /sobre.
 * Conteúdo todo em português europeu.
 *
 * Estrutura:
 *  1. Resumo curto da app
 *  2. Acordeões com tutorial, instalação, boas práticas, ajuda, história
 */
export function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 pt-3 pb-6 md:px-6 md:pt-4">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <img
            src="/icon-header.png"
            alt=""
            className="h-10 w-auto rounded-md"
          />
          <h2 className="text-foreground text-xl font-semibold tracking-tight md:text-2xl">
            Sobre o ScoutBangers
          </h2>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          O <strong className="text-foreground">ScoutBangers</strong> é um player de música 
          criado para facilitar a vida de toda a gente que quer ouvir música escutista.  
          Ouvir diretamente da drive é muito chato, e o problema em ouvir no spotify com
          as músicas descarregadas é que se a drive for atualizada,
          o spotify não atualiza automaticamente.
          O scoutbangers resolve ambos os problemas, e é ainda uma boa maneira de 
          conheceres músicas novas, e ainda tem a letra da maior parte das músicas
          disponível para ver enquanto ela reproduz :D. Sempre que novas músicas são adicionadas à drive, 
          elas aparecem automaticamente na app, prontas para serem ouvidas. Tem todas as funcionalidades
          básicas de um player como o spotify, mas é 100% escutista :)

        </p>
      </section>

      <Accordion
        type="single"
        collapsible
        defaultValue="features"
        className="border-border bg-card flex flex-col rounded-md border px-4"
      >
        <AccordionItem value="features">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Sparkles className="text-primary size-4" />
              Funcionalidades
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="text-muted-foreground flex flex-col gap-2 text-sm leading-relaxed">
              <li>
                <strong className="text-foreground">Biblioteca partilhada:</strong>{" "}
                todas as músicas vêm de uma pasta do Google Drive comum. Quando
                alguém adiciona uma música nova, ela aparece para toda a gente.
              </li>
              <li>
                <strong className="text-foreground">Reprodução em segundo plano:</strong>{" "}
                a música continua a tocar mesmo com o ecrã bloqueado ou a usar
                outras apps.
              </li>
              <li>
                <strong className="text-foreground">Fila de reprodução:</strong>{" "}
                desliza uma música para a direita para a adicionares à fila, ou
                para a esquerda para a remover.
              </li>
              <li>
                <strong className="text-foreground">Playlists:</strong> cria as
                tuas próprias playlists, partilha-as por link e guarda as dos
                outros — aparecem na tua página de Playlists em "Guardadas",
                prontas a ouvir.
              </li>
              <li>
                <strong className="text-foreground">Letras:</strong> abre uma
                música no leitor inteiro e toca no ícone da página para veres a letra
                vinda diretamente do Cancioneiro. As letras atualizam-se
                sozinhas quando o documento é editado. Se precisares dos
                acordes, há um botão "Ver acordes" que abre o Cancioneiro com os acordes.
              </li>
              <li>
                <strong className="text-foreground">Estatísticas pessoais:</strong>{" "}
                vê as tuas músicas e artistas mais ouvidos no teu perfil.
              </li>
              <li>
                <strong className="text-foreground">Atividade dos amigos:</strong>{" "}
                vê em tempo real o que os outros estão a ouvir.
              </li>
              <li>
                <strong className="text-foreground">Modo offline:</strong>{" "}
                transfere as músicas para o teu dispositivo e ouve-as sem
                ligação à internet. Recomendo isto para ouvir as músicas sem delay, e para evitar que a música pare quando bloqueias o telemóvel.
              </li>
              <li>
                <strong className="text-foreground">Controlo no ecrã de bloqueio:</strong>{" "}
                play, pausa e mudança de música funcionam diretamente nos
                controlos multimédia do telemóvel.
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="install">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Download className="text-primary size-4" />
              Como instalar a app
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4 text-sm leading-relaxed">
              <p className="text-muted-foreground">
                O ScoutBangers funciona no browser, mas instalado fica muito
                melhor — sem barra de endereço, com ícone no ecrã principal e
                modo offline mais estável.
              </p>

              <div className="border-border bg-background flex flex-col gap-2 rounded-md border p-3">
                <div className="text-foreground flex items-center gap-2 font-medium">
                  <Smartphone className="size-4" />
                  Android (Chrome ou Brave)
                </div>
                <ol className="text-muted-foreground ml-5 list-decimal space-y-1">
                  <li>Abre a app no browser.</li>
                  <li>
                    Toca no menu (três pontos no canto superior direito).
                  </li>
                  <li>
                    Escolhe <strong className="text-foreground">"Instalar app"</strong>{" "}
                    ou <strong className="text-foreground">"Adicionar ao ecrã principal"</strong>.
                  </li>
                  <li>Confirma. O ícone aparece junto às outras apps.</li>
                </ol>
              </div>

              <div className="border-border bg-background flex flex-col gap-2 rounded-md border p-3">
                <div className="text-foreground flex items-center gap-2 font-medium">
                  <Apple className="size-4" />
                  iPhone (Safari)
                </div>
                <ol className="text-muted-foreground ml-5 list-decimal space-y-1">
                  <li>Abre a app no Safari (não funciona no Chrome no iOS).</li>
                  <li>
                    Toca no botão de partilha{" "}
                    <span className="text-foreground">(quadrado com seta)</span>{" "}
                    na barra inferior.
                  </li>
                  <li>
                    Desliza para baixo e escolhe{" "}
                    <strong className="text-foreground">"Adicionar ao ecrã principal"</strong>.
                  </li>
                  <li>Confirma com "Adicionar" no canto superior direito.</li>
                </ol>
              </div>

              <div className="border-border bg-background flex flex-col gap-2 rounded-md border p-3">
                <div className="text-foreground flex items-center gap-2 font-medium">
                  <BookOpen className="size-4" />
                  Computador
                </div>
                <p className="text-muted-foreground">
                  No Chrome, Edge ou Brave: aparece um ícone de instalação na
                  barra de endereço (ao lado dos favoritos). Clica e confirma.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="best-practices">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Lightbulb className="text-primary size-4" />
              Boas práticas
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <ul className="text-muted-foreground flex flex-col gap-3 text-sm leading-relaxed">
              <li>
                <strong className="text-foreground">Instala a app.</strong>{" "}
                Em modo instalado a reprodução em segundo plano é muito mais
                fiável.
              </li>
              <li>
                <strong className="text-foreground">Transfere as músicas em Wi-Fi.</strong>{" "}
                Vai a "Perfil" → "Transferências offline" → toca em "Transferir".
                Depois a música toca instantaneamente, mesmo sem internet, e
                não consome dados móveis.
              </li>
              <li>
                <strong className="text-foreground">Usa a fila para planear o que vem a seguir.</strong>{" "}
                Desliza qualquer música para a direita para a meter na fila —
                útil para encadear umas quantas sem interromper a que está a
                tocar.
              </li>
              <li>
                <strong className="text-foreground">Atualiza o catálogo.</strong>{" "}
                Se sabes que foi adicionada uma música nova ao Drive e ainda não
                aparece, toca no ícone de recarregar no canto superior direito
                — força uma sincronização imediata.
              </li>
            </ul>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="help">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <HelpCircle className="text-primary size-4" />
              Ajuda — problemas comuns
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4 text-sm leading-relaxed">
              <div>
                <p className="text-foreground font-medium">
                  A música pára quando bloqueio o telemóvel.
                </p>
                <p className="text-muted-foreground mt-1">
                  Acontece sobretudo em browsers (não instalada). Instala a
                  app no ecrã principal — depois disso o sistema operativo
                  trata a reprodução de outra forma e fica muito mais estável.
                  Transferir a música também ajuda muito.
                </p>
              </div>

              <div>
                <p className="text-foreground font-medium">
                  Demora muito a começar a tocar.
                </p>
                <p className="text-muted-foreground mt-1">
                  Cada música tem de ser carregada do Drive na primeira vez.
                  Se a transferires (Perfil → Transferências), passa a tocar
                  instantaneamente nas vezes seguintes.
                </p>
              </div>

              <div>
                <p className="text-foreground font-medium">
                  Não vejo as músicas novas que foram adicionadas.
                </p>
                <p className="text-muted-foreground mt-1">
                  A app guarda em cache a lista durante 5 minutos. Toca no
                  ícone de recarregar no canto superior direito para forçar
                  uma atualização.
                </p>
              </div>

              <div>
                <p className="text-foreground font-medium">
                  Quero apagar tudo o que tenho transferido.
                </p>
                <p className="text-muted-foreground mt-1">
                  Vai a Perfil → Transferências offline → "Remover tudo".
                  Isto não apaga as músicas do Drive, só o que está guardado
                  no teu dispositivo.
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="history">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <History className="text-primary size-4" />
              História do projeto
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-muted-foreground flex flex-col gap-3 text-sm leading-relaxed">
              <p>
                O <strong className="text-foreground">ScoutBangers</strong>{" "}
                nasceu da vontade de ter um sítio simples para ouvir e
                partilhar música com toda a gente, sem listas que ficam desatualizadas,
                sem ter de escolher música a música qual pôr a dar e sem
                ter de andar a mandar ficheiros pelo WhatsApp. Quem nunca esteve 
                numa atividade e quis pôr a tocar músicas escutistas e teve de andar a
                pedir aos outros para lhe enviarem as músicas por mensagem ou o link da drive?              </p>
              <p>
                Inicialmente era só uma drive com músicas, havia muitas músicsa por exemplo de 
                fescuts das quais não havia áudios, então eu fui cortando e colecionando na drive, 
                mas ouvir na drive é de facto chato.
              </p>
              <p>
                A ideia é que qualquer pessoa pode adicionar uma música à
                pasta partilhada do Google Drive, e em poucos minutos ela
                aparece na app para toda a gente, com capa, artista e título
                lidos automaticamente das tags do ficheiro.
              </p>
              <p>
                O projeto evoluiu rapidamente: começou só como um leitor
                básico, depois ganhou contas e estatísticas, playlists, um
                feed social com a atividade dos amigos, e por fim modo offline
                para deixar de depender do streaming a cada utilização.
              </p>
              <p>
                A interface é deliberadamente minimalista — uma paleta de
                duas cores, controlos óbvios, sem barras de publicidade nem
                distrações. Ouvir bangers é o que importa.
              </p>
              <p className="text-foreground italic">
                Feito com carinho para a P'ESTE e o resto da malta — Henrique Teixeira 680 Santão-tão-tão
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="contact">
          <AccordionTrigger>
            <span className="flex items-center gap-2">
              <Info className="text-primary size-4" />
              Contacto e sugestões
            </span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="text-muted-foreground flex flex-col gap-3 text-sm leading-relaxed">
              <p>
                Tens uma ideia para melhorar a app? Encontraste um bug? Queres
                contribuir com design para a aplicação? (eu não tive tempo para 
                fazer isto algo bonito ahaha) Envia-me uma mensagem no
                WhatsApp 915310103 ou no insta @henriqueft04 
             </p>
              <p>
                Queres ajudar? Podes sugerir design para a aplicação, 
                ela é nova ainda e tem muito potencial para ficar bonita,
                mas eu não sou designer e não tive tempo para me dedicar a isso lool.
                Queres contribuir com código? Manda-me mensagem :D
              </p>
              <p>
                Podes também me mandar 50 centimos para o mbway para ajudar a pagar o 
                domínio do site ahaha (mas não é preciso claro, a app é grátis e vai continuar grátis)
              </p>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <p className="text-muted-foreground text-center text-xs">
        <Info className="mr-1 inline size-3" />
        Esta página existe para te ajudar a tirar o máximo da app. Sugestões
        são bem-vindas.
      </p>
    </div>
  )
}
