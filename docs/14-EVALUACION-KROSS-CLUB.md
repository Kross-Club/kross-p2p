# 14 · Kross Club y «Vuelve a jugar» — evaluación crítica del concepto de marca

> **Fecha: 05-sep-2026.** Documento de estrategia, no de código. Responde al pedido de
> evaluar si el universo narrativo *Kross Club* y el mensaje *«Vuelve a jugar»* pueden ser una
> ventaja competitiva real o solo un diferencial estético.
>
> Está escrito desde cuatro sillas a la vez —CMO de marca global, director creativo,
> estratega de branding e investigador de mercado— y con una regla: **cada afirmación sobre
> Kross sale de este repo** (`ESTADO-OPERATIVO.md`, `10-MANUAL-DE-MARCA.md`,
> `ICP Sales/VALIDACION-AGENCIA.md`, `07-CONTRATO-360PAY.md`, `src/config/propuesta.ts`), y
> cada afirmación sobre el mercado nombra su caso. Donde una cifra externa es aproximada, se
> dice.

---

## 0. Veredicto en una página

**El insight es bueno. La ejecución propuesta lo desperdicia, y el momento es el peor posible.**

1. **«Los adultos dejan de jugar; Kross devuelve tiempo»** es una idea humana, verdadera y
   rara en software B2B. Vale la pena conservarla. Pero es una promesa **al comerciante**
   —el que pierde horas llamando para que recojan— y el concepto la entrega a otra persona:
   al comprador, que nunca pidió tiempo, que compró un suplemento y que quiere saber cuándo
   pasar por Shalom.

2. **Los minijuegos resuelven una espera que no existe.** «Juega mientras preparamos tu
   pedido» es el modelo mental de Rappi. En Kross el pedido se recoge en agencia dos a cinco
   días después, y la única espera dentro de la app —del yape al pedido confirmado— dura
   6.6 segundos. Lo que el comprador siente después de adelantar S/95 no es aburrimiento;
   es **ansiedad por su plata**. La respuesta a eso es certeza (tracking, clave de recojo,
   comprobante), que ya está construida, no un runner de 30 segundos.

3. **El universo narrativo llega antes que el producto que debería ganárselo.** Harley
   fundó HOG en 1983, ochenta años después de su primera moto. Red Bull abrió Media House
   en 2007, veinte años después de la lata. LEGO hizo su película en 2014, diez años después
   de casi quebrar por diversificarse hacia el «estilo de vida» y volver al ladrillo. Kross
   tiene hoy dos marcas activas, veinte pedidos y un cobro en producción desde hace quince
   días. Un universo autorado sin base de usuarios no es una marca cultural: es lore.

4. **El concepto contradice decisiones tomadas hace un mes.** El manual v2.0 (ago-2026)
   prohíbe morado neón, degradados e ilustración 3D, prohíbe escribir «Kross Club» y deja
   por escrito que el white-label del comprador «no se toca». `propuesta.ts` obliga a que
   toda cifra sea señalable en la base; el mock de portada muestra «+50,000 jugadores,
   +1,200 tiendas, 4.8/5». O el manual estaba equivocado o lo está este concepto; los dos
   no pueden ser ciertos y hay que decidirlo explícitamente, no por acumulación.

5. **Lo que sí puede ser una ventaja difícil de copiar no es la estética ni la serie: es
   la capa de comprador que cruza tiendas.** Identidad por DNI/teléfono, adelanto
   protegido, puntos canjeables en cualquier tienda Kross, checkout de un toque en una
   marca que nunca visitaste. Eso es lo que Shop Pay es para Shopify y lo que Yape es para
   los comercios peruanos: un ingrediente que el comprador **pide** y que el comerciante
   acepta porque **convierte**. Ahí sí tiene sentido que Kross sea visible. Y a esa capa se
   le puede llamar Kross Club sin necesidad de un club secreto.

**Recomendación en una frase:** archiva la serie, mata los juegos, conserva la frase y el
insight para el comerciante, y construye la capa de comprador cross-tienda. Rehabilita la
narrativa recién cuando haya alguien a quien contársela: en la sección 8 hay compuertas
numéricas para decidir cuándo.

---

## 1. Lo que el concepto no ve: seis choques con el negocio real

Antes de las diez preguntas, los puntos donde el concepto se rompe contra lo que dice este
repo. No son opiniones de gusto; son hechos operativos.

### 1.1 La espera muerta no está donde el concepto la pone

| Momento | Duración real | Qué siente el comprador | Qué necesita |
|---|---|---|---|
| Del yape al pedido confirmado | 6.6 s (primer cobro real, 21-ago) | Nada; no da tiempo | Nada |
| Del pedido a «tu paquete está en la agencia» | 1–4 días, fuera de la app | «¿Llegará? ¿Y mis S/95?» | Certeza, no distracción |
| Del aviso al recojo | 27–35 % necesita que alguien insista (Frank, Rousbelt) | Pereza, olvido | Un empujón con consecuencia |

El único «tiempo muerto» dentro de la app es el que el producto ya eliminó. El tiempo
muerto real es fuera de la app y la emoción dominante es desconfianza. Domino's no puso un
juego mientras horneaba la pizza: puso el *Pizza Tracker* (2008), porque la transparencia
baja la ansiedad más que el entretenimiento. Kross ya tiene el tracker, la clave de recojo
y el comprobante. El juego competiría con el mejor momento del propio producto.

### 1.2 El que paga no es el que juega

Harley, Red Bull, LEGO, Nintendo y Patagonia venden al mismo humano que ama la marca. En
Kross el que paga la suscripción es el comerciante y el que jugaría es su comprador. Un
universo que enamora al comprador no cobra; un comerciante enamorado paga $50. Toda marca
B2B2C que construyó marca de consumidor (Shopify con Shop, Klarna con su app, Square con
Cash App) lo hizo **después** de tener miles de comercios y un flujo de pagos que
monetizar del lado del consumidor.

### 1.3 El comprador de recompra compra una vez al mes; el juego pide una vez al día

El ICP actual son marcas de suplementos, cosmética y café (`ICP LTV`). La frecuencia natural
de compra es mensual. Un juego con puntos necesita un disparador frecuente (Hook model de
Eyal: disparador → acción → recompensa variable → inversión). Sin disparador diario el
juego se prueba una vez —el usuario tiene curiosidad— y no vuelve. Duo Duo Orchard de
Pinduoduo y los juegos de Shopee funcionan porque el marketplace ya se abre a diario; el
juego no crea la frecuencia, la aprovecha.

### 1.4 Los puntos salen del margen de la marca, no de Kross

`stores.points_rate` («1 punto = S/X») es margen del comerciante (`03-LOYALTY-ENGINE.md`:
«sale del margen COD; calibrar por marca»). Si el juego regala 50 puntos por partida a
S/0.05 el punto, cada partida cuesta S/2.50 a un comerciante que no autorizó pagar por el
ocio de su cliente. Si se pone un tope, los puntos se vuelven simbólicos y el juego pierde
la razón de jugarse. Para que los puntos sean cross-tienda hace falta un **operador de
coalición que financie y compense** (como Shop Cash, que Shopify financia con 1 % de las
compras por Shop Pay, o Puntos Bonus de Intercorp en Perú). Ese operador sería Kross, y
hoy Kross vive de una comisión por cobro de 360pay (`07-CONTRATO-360PAY.md`). Los números
no existen todavía para saber si esa comisión aguanta un programa de puntos.

### 1.5 El adelanto de S/95 ya es la fricción más grande y no está medida

`VALIDACION-AGENCIA.md` deja abierta la tensión: el mercado adelanta S/20–30 y Kross pide la
mitad del pedido. Nadie sabe aún si eso mata la conversión del paso 3. Cualquier inversión
de marca dirigida al comprador es secundaria frente a esa pregunta, porque si el paso 3
no convierte, no hay comprador que enamorar. Y si convierte, será por confianza, no por
un runner.

### 1.6 El manual v2.0 y este concepto se anulan mutuamente

| Manual v2.0 (ago-2026) | Concepto Kross Club (sep-2026) |
|---|---|
| «Nada de morado neón, gradientes, ilustraciones 3D» | Vaporwave, synthwave, cielos magenta |
| «El nombre es Kross; "Kross Club" es uso incorrecto» | La marca del universo es Kross Club |
| «Lo que ve el comprador se pinta con el color de cada marca; el white-label no se toca» | Kross visible en la app del comprador |
| «Precisión, no artesanía; una herramienta seria, no una marca de merch» | «Que parezca una serie, no un SaaS» |
| Voz: «cifras concretas antes que adjetivos» | Portada con cifras inventadas |

Esto no es un detalle de consistencia. El manual se escribió porque «un comprador que evalúa
dónde va a mover su plata necesita leer precisión». Ese argumento sigue siendo cierto. Lo
que puede ser distinto es la **superficie del comprador**, y eso admite dos sistemas
visuales bajo una arquitectura de marca (ver §8).

---

## 2. Pregunta 1 — ¿Alguien hace algo realmente parecido?

Nadie hace exactamente esto, y eso no es una señal de oportunidad sino de que las piezas
por separado ya se probaron y se sabe cuál funciona.

### 2.1 Estratégicamente parecido (B2B que se vuelve marca de consumidor)

| Caso | Qué hizo | Cuándo lo hizo | Qué enseña |
|---|---|---|---|
| **Shopify → Shop / Shop Pay / Shop Cash** | Un botón morado en el checkout de un millón de tiendas; app de consumidor; moneda cross-tienda que Shopify financia | Shop app 2020, con >1M comercios; Shop Cash 2023 | El ingrediente se acepta porque **convierte** (Shopify afirma hasta 50 % mejor que checkout invitado). La marca de consumidor nació de datos de pago guardados, no de una narrativa |
| **Klarna** | Fintech B2B2C que se volvió marca rosa con Snoop Dogg («Smoooth») y app con recompensas | Campaña 2016–2019, quince años después de fundarse | Se puede volver marca de consumidor. El comerciante la instala igual por conversión y ticket, no por la campaña |
| **Block: Square + Cash App** | Cash App como marca cultural (música, hip hop) separada del producto B2B | Cash App 2013, Square 2009 | Dos marcas, dos audiencias, dos sistemas visuales. No mezcló la caja registradora con la cultura |
| **Yape (BCP)** | Marca de consumidor con >15 M de usuarios que los comercios *tienen* que aceptar | P2P gratuito primero; comercios después | El único «Powered by» que un comerciante pide poner es el que su cliente le exige |
| **Mercado Libre → Mercado Play** | Streaming gratis como beneficio de fidelidad | 2023, con decenas de millones de compradores activos | Entretenimiento como beneficio funciona cuando ya hay base y frecuencia |
| **Mailchimp** | SaaS para pymes con marca cultural (Freddie, humor, «MailKimp» en Serial 2014) | Vendida a Intuit por ~US$12 mil M en 2021 | La marca cultural B2B **sí** vende software a pymes, pero le habla al **dueño de la pyme**, no a sus clientes |
| **Salesforce Trailhead / Trailblazers** | Gamificación con insignias y comunidad de usuarios del software | 2014 | La gamificación B2B que funciona gamifica **aprender a usar el producto**, no el ocio de terceros |
| **Intel Inside** | Ingrediente visible en el producto de otro | 1991 | Intel financió con un fondo cooperativo parte de la publicidad de los fabricantes. El ingrediente visible **se compra**, no se impone |

### 2.2 Minijuegos dentro de apps de comercio

- **Pinduoduo (Duo Duo Orchard, 2018)**: cultivar un árbol virtual con visitas diarias y
  recibir fruta real. La empresa reportó decenas de millones de usuarios diarios. Funciona
  porque PDD se abre a diario y el premio es un producto físico del propio marketplace.
- **Shopee (Shopee Farm, Shake, Candy)** en el sudeste asiático y Brasil: monedas canjeables
  en el marketplace, financiadas por Shopee como costo de adquisición.
- **Temu** (juegos de pesca, granja): idéntico modelo, subvencionado con centenares de
  millones en marketing.
- **Rappi, Uber, PedidosYa**: apps de espera corta y **ninguna** puso juegos en la espera.
  Pusieron mapa, tiempo estimado y estado.

Patrón: los juegos viven en **marketplaces B2C con frecuencia diaria y subsidio del
operador**. No hay un caso de SaaS B2B white-label con minijuegos en la app del comprador
que se haya convertido en ventaja. No es porque nadie lo pensó.

### 2.3 Estéticamente parecido

Synthwave/vaporwave + anime contemporáneo es un género, no una identidad: Drive (2011),
Hotline Miami (2012), Blade Runner 2049, Cyberpunk 2077, las playlists de Spotify, y en
2021 media escena cripto/NFT. Es una estética **muy disponible**, que es lo contrario de
distintiva. Lo que Byron Sharp llama activos distintivos (*How Brands Grow*) son cosas que
solo tu marca posee; el cielo magenta lo posee todo el mundo.

**Respuesta corta:** las piezas existen por separado. La combinación que propones (SaaS
B2B + juegos en espera + universo narrativo secreto + ingrediente visible) no la hace nadie
porque las dos primeras ya demostraron que dependen de condiciones que Kross no tiene.

---

## 3. Pregunta 2 — ¿Ventaja competitiva sostenible o branding atractivo?

Hay que separar tres cosas que el concepto mezcla:

| Componente | ¿Copiable? | ¿Genera ventaja? |
|---|---|---|
| Estética synthwave/anime | En una semana, por cualquiera | No. Es un estilo |
| Serie / universo narrativo | Copiable en forma; **la audiencia** no se copia | Solo si existe audiencia. Hoy no |
| Minijuegos con puntos | Copiable en un mes | No, y cuesta margen |
| Insight «Kross devuelve tiempo» | La frase sí; **la prueba** no | Sí, si el producto lo demuestra con horas medidas |
| Identidad de comprador cross-tienda + adelanto protegido + puntos de coalición | Difícil: requiere volumen de dos lados | **Sí.** Es un efecto de red |

Una ventaja sostenible tiene que ser algo que mejora con cada cliente nuevo. La estética no
mejora con el cliente 500. La serie tampoco. La identidad de comprador sí: cada tienda que
entra a Kross hace que el comprador con «Kross ID» tenga más lugares donde su adelanto ya
está protegido y sus puntos valen; cada comprador nuevo hace que una tienda nueva convierta
mejor desde el día uno. Eso es Shop Pay, y es lo único del concepto con esa forma.

**Veredicto:** como está planteado, es branding atractivo. Puede volverse ventaja si el
«club» deja de ser una serie y pasa a ser un **programa de comprador con efectos de red**.

---

## 4. Pregunta 3 — ¿Un comerciante compraría Kross antes que otro CRM por esto?

**No.** Y este repo ya tiene la evidencia de por qué.

Las entrevistas del 20-ago (`VALIDACION-AGENCIA.md`) preguntaron qué se rompe primero al
escalar. Respuestas: el % de entrega, la rentabilidad, la cobranza y las boletas. Ninguna se
resuelve con un universo narrativo. El comerciante que va a mover su plata por Kross quiere
saber tres cosas: si el cobro es seguro, si más gente recoge y cuántas horas de llamadas le
ahorra. El manual v2.0 lo escribió con precisión: «necesita leer precisión, no artesanía».

Peor: el universo contiene una **anti-señal** para ese comprador. «Dentro de Kross Club
nadie habla de negocios» es exactamente lo contrario de lo que quiere un operador que
llama al 100 % de sus clientes para que recojan. Ese operador quiere un lugar donde **sí**
se hable de tasas de recojo y de cómo otro logró 73 %.

### Lo que falta para que un comerciante elija Kross por la marca

1. **Prueba, no promesa.** «Vuelve a jugar» solo es creíble para el comerciante si Kross le
   muestra en el panel *«esta semana Kross cobró 41 adelantos y avisó 38 recojos sin que tú
   llamaras: ~6 horas devueltas»*. La frase sin la cifra es un póster.
2. **Prueba social entre pares.** Mailchimp, HubSpot (INBOUND) y Shopify crecieron con
   comunidades de dueños de pyme que se enseñan entre sí. El «club» que vende software es
   un club de **operadores**, real, con nombres y apellidos, no un club de personajes.
3. **Un motivo del lado del comprador para exigirlo.** «¿Aceptan Kross?» como se pregunta
   «¿aceptan Yape?». Eso requiere que el comprador gane algo visible al pagar por Kross:
   protección del adelanto, un toque, puntos que valen en otras tiendas. Ver §7.

**Lo que sí tiene fuerza para el comerciante y ya está en tus piezas:** la tarjeta de
invitación. «Ya trabajaste suficiente por hoy» y «Ven solo si recuerdas por qué
empezaste» son las dos mejores líneas de todo el material. Dirigidas a **50 operadores COD
peruanos**, en una tarjeta física con un código de acceso al demo, son una campaña de
correo directo barata y medible. Eso no necesita una serie.

---

## 5. Pregunta 4 — ¿El comprador desarrollaría cariño por los juegos?

**No. Jugaría una o dos veces y no volvería.** Razones, en orden de peso:

1. **Sin disparador.** El comprador entra a la app de la marca cuando compra (mensual) o
   cuando le llega un aviso de recojo. Ninguno de esos momentos pide jugar. Los benchmarks
   de la industria (GameAnalytics) sitúan la retención a 30 días de los juegos hipercasuales
   en un dígito bajo **con** notificaciones diarias y **con** presupuesto de adquisición.
   Un juego dentro de la app de una marca de café no tendrá ni una cosa ni la otra.
2. **Recompensa sin valor o con costo.** Si 50 puntos son S/2.50 en la próxima compra de
   un suplemento de S/189, es ruido. Si son más, se los come el margen de la marca (§1.4).
   La mayoría de los programas gamificados fallan por esto: Gartner predijo en 2012 que el
   80 % fracasaría por mal diseño de incentivos, y lo que vino después le dio la razón.
3. **Disonancia.** Acabo de adelantar S/95 a una tienda que conocí en un anuncio. Que me
   propongan un runner en ese momento trivializa una decisión que me costó. Compara con la
   emoción que sí quiero: «pago confirmado, aquí está tu comprobante, este es tu código de
   recojo».
4. **Cariño hacia quién.** Si el juego vive dentro de la app de *Gadicaf*, el cariño (si lo
   hubiera) es hacia Gadicaf. Para que sea hacia Kross, Kross tiene que ser visible, y eso
   abre el conflicto del white-label sin haber ganado nada.

Los casos donde la gamificación sí generó cariño de marca —Duolingo con el búho y la racha,
Ant Forest de Alipay plantando árboles reales, Nintendo— tienen el juego **en el centro del
uso**, no en un pasillo lateral de un checkout mensual.

**Lo que sí podría mover conducta:** un incentivo con consecuencia en el momento que
importa. «Recoge en 48 horas y tu saldo lleva 5 % de descuento» ataca el 27–35 % de
compradores que hay que perseguir. Eso es un mecanismo de puntos aplicado al problema real
del negocio, no un juego.

---

## 6. Pregunta 5 — Riesgos

### 6.1 Narrativos

- **El universo se contradice a sí mismo.** El insight dice «no habla de videojuegos, habla
  de vivir». El storyboard pone un visor VR, «todo se apaga» y «otra dimensión». Es escapismo
  digital vendiendo su contrario.
- **«La vida se disfruta diferente cuando el dinero ya no es un problema»** (cuadro 12) es
  la frase más peligrosa del material. Es la promesa del gurú de e-commerce con Lamborghini,
  el mismo mundo del que el manual v2.0 quiso alejarse. Ante un operador que persigue el
  35 % de sus recojos, suena a estafa. Ante un comprador, es irrelevante.
- **El misterio sin audiencia es confusión.** *I Love Bees* (Halo 2, 2004) funcionó porque
  millones esperaban Halo. Una invitación sin remitente de una marca que nadie conoce no
  intriga; se ignora. El misterio es un multiplicador de atención existente, no un
  generador.
- **«Deja tu celular»** en la puerta del club. El producto es una app. La metáfora corre en
  contra del producto.
- **El arco «pierde hasta entender que no era ganar»** es bueno, pero es el arco de Kung Fu
  Panda, Cars y un tercio del cine familiar. Necesita un giro propio para no ser genérico.

### 6.2 Comerciales

- **Confusión de audiencia en la portada.** El mock mezcla en una sola página «Vuelve a
  jugar» para compradores, juegos, «personas reales», y un panel de vendedor. Un comerciante
  que llega buscando cobrar con Yape no sabe qué es esto. Un jugador que llega no tiene nada
  que hacer porque no se juega en `krossclub.app`, se juega en la app de cada tienda.
- **Cifras inventadas** («+50,000 jugadores, +1,200 tiendas, 4.8/5») en un mock que quiere
  parecer real. `propuesta.ts` tiene por regla que cada cifra sea señalable en la base. Si
  esto se publica, la primera marca que verifique deja de confiar.
- **White-label reconsiderado a mitad de camino.** Las marcas que ya usan Kross compraron
  «tu app con tu marca». Cambiar eso unilateralmente es un cambio de contrato.

### 6.3 Psicológicos

- **Trivialización post-pago** (§5.3).
- **Incentivo perverso**: puntos por jugar dan puntos a quien juega, no a quien compra ni
  a quien recoge. Recompensas lo contrario de lo que quieres.
- **Lo que Sharp llama «amor de marca»** es mucho más raro de lo que los planes de
  marketing suponen. La mayoría de los compradores de la mayoría de las categorías son
  leales leves a varias marcas. Diseñar el plan alrededor de cariño profundo hacia un
  software de cobro es apostar contra la evidencia de cuarenta años de datos de compra.

### 6.4 Culturales

- **Las referencias son generadas por IA y se nota.** Puede ser solo material de referencia,
  pero el público que ama el anime y la ilustración japonesa contemporánea es hoy el más
  hostil a la ilustración generada por IA. Lanzar un «manga corto» con ese acabado a esa
  audiencia es entrar a su casa con lo que más desprecia.
- **Sinthwave + anime en Perú** se lee como cripto, gamer o academia de trading. No es la
  lectura que quiere una marca que maneja plata ajena.
- **Anime en Perú es una fortaleza real** (Perú aparece de forma consistente entre los
  países con mayor interés por anime en Google Trends). El vehículo no está mal elegido;
  el acabado y el mensaje sí.

### 6.5 Financieros

- **Costo del contenido contra ingreso actual.** Un episodio de un minuto de animación 2D
  de calidad comisionada cuesta decenas de miles de dólares; una serie de carruseles con
  ilustrador humano, varios miles al mes. Kross tiene hoy dos marcas y una comisión por
  cobro. Cualquier gasto en universo es varias veces el ingreso total.
- **Puntos de coalición sin fuente de fondos** (§1.4).
- **Costo de oportunidad de tres desarrolladores.** Cada minijuego es semanas de front que
  no se dedican a las boletas SUNAT y a la guía automática, que dos de tres operadores
  nombraron espontáneamente como su cuello de botella.

### 6.6 De ejecución

- **Dos sistemas de marca sin arquitectura.** Ink/lima para el panel y synthwave para el
  club sin una regla escrita de cuándo va cuál.
- **Nombre.** El manual prohíbe «Kross Club»; el dominio es `krossclub.app`; el contrato con
  360pay está firmado como Kross Club; el correo del equipo es `@kross.club`. El nombre ya
  está decidido por los hechos y hay que ordenarlo, no discutirlo.
- **Legal.** Puntos por habilidad canjeables por descuento son promoción comercial
  ordinaria; cualquier componente de azar (sorteos, cajas, ruletas) requiere autorización
  de MINCETUR. Verificar con asesoría antes de diseñar recompensas variables.
- **Registro en Indecopi** del nombre y del símbolo sigue pendiente (manual §9). Antes de
  hacer visible «Kross» en miles de checkouts, registrar.

---

## 7. Pregunta 8 (adelantada porque ordena todo lo demás) — ¿Qué puede ser propiedad intelectual difícil de copiar?

No el logo, no el estilo, no la serie. El **sistema**:

### 7.1 Kross ID: la identidad del comprador que cruza tiendas

Ya existe la mitad: el comprador se identifica por DNI/teléfono, el DNI trae su nombre,
la dirección se valida contra cobertura, el pago llega firmado. Falta que esa identidad
viaje: que quien compró en Kross Shop pueda comprar en Gadicaf con un toque, con su Yape
ya asociado, su agencia preferida y su historial de recojo. Es Shop Pay. Es lo único del
plan que **mejora con cada tienda y con cada comprador**.

### 7.2 Adelanto protegido: la confianza como ingrediente visible

El comprador COD peruano adelanta poco porque no confía. Kross está pidiendo S/95. La
única forma de que ese monto no mate la conversión es que un tercero conocido responda por
él: «Tu adelanto está protegido por Kross: si tu pedido no llega a la agencia, te lo
devolvemos». Es *Compra Protegida* de Mercado Libre, que es la razón de fondo por la que
Mercado Libre existe en Latinoamérica. Requiere reglas, un fondo y datos de recojo por
tienda para asumir el riesgo. Kross ya está recogiendo esos datos (pedidos *en destino* vs.
*entregados*). Esto sí justifica que Kross sea visible en el paso 3, y es lo que le da al
comerciante una razón para **querer** el sello.

### 7.3 Puntos de coalición con compensación

Puntos que se ganan en cualquier tienda Kross y se canjean en cualquier otra, financiados
parcialmente por Kross desde la comisión de cobro (como Shop Cash) y compensados entre
tiendas. Difícil de copiar porque requiere volumen de dos lados y un motor de
compensación. Peligroso de lanzar sin volumen porque el subsidio no se paga solo.

### 7.4 El grafo de recojo

Kross sabrá, por comprador y por tienda, quién recoge, cuánto tarda y cuánto adelantó.
Con volumen eso es un score de comprador que ningún competidor tiene y que permite
adelantos menores a quien siempre recoge. Es dato, no marca, pero es lo que hace posible
la promesa de §7.2 sin quebrar.

### 7.5 El club de operadores (real)

Los operadores que compartieron sus tasas de recojo en `VALIDACION-AGENCIA.md` son el
embrión de la única comunidad que vende software: dueños que se enseñan entre sí. HOG,
INBOUND y Trailblazers son eso. Es la parte «club» que sí tiene sentido y sí es difícil de
copiar, porque las relaciones no se copian.

### 7.6 La voz

«Ya trabajaste suficiente por hoy.» «Ven solo si recuerdas por qué empezaste.» Una voz
que habla al comerciante como persona cansada y no como «emprendedor» es rara en el
mercado peruano de software, donde todo es «potencia tu negocio». La voz es un activo
distintivo si se sostiene en cada notificación, cada correo de cobro y cada pantalla vacía
del panel. Y cuesta cero.

Lo que **no** está en esta lista: la estética, la serie, los minijuegos, el símbolo con
neón.

---

## 8. Pregunta 6 — Cómo evolucionar el universo en diez años

Un roadmap conceptual con **compuertas**: nada de la fase siguiente empieza sin cumplir la
métrica de la anterior. El error de LEGO en 2003 fue saltarse las compuertas.

### Fase 0 · Prueba de vida (hoy → 6 meses)

- **Marca:** una sola. Kross, ink y lima, manual v2.0. Ninguna pieza de universo.
- **Producto:** resolver la tensión del adelanto (conversión del paso 3 y tasa de recojo
  contra el 73 % de Frank). Boleta y guía automáticas. Recordatorios de recojo (doc 08).
- **Voz:** adoptar «Vuelve a jugar» como **promesa interna** al comerciante y empezar a
  medir horas devueltas en el panel: llamadas que no hizo, capturas que no revisó.
- **Compuerta:** 30 tiendas pagando, 1.000 compradores con adelanto cobrado, tasa de recojo
  medida.

### Fase 1 · El ingrediente (6 → 18 meses)

- **Kross visible en un solo lugar:** el paso 3. «Adelanto protegido por Kross» con reglas
  publicadas y fondo de garantía. A/B contra el paso 3 sin sello (el `checkout_ab_mode` ya
  existe). Si el sello no sube conversión, el ingrediente no tiene sustento y se retira.
- **Kross ID:** comprador que ya pagó una vez compra en cualquier tienda Kross con un toque.
- **Compuerta:** el sello sube conversión de forma medible; ≥15 % de los compradores han
  comprado en más de una tienda Kross.

### Fase 2 · Kross Club como programa (18 → 36 meses)

- **Kross Club = el programa del comprador:** protección + un toque + puntos de coalición
  + trato preferente para quien siempre recoge. Con nombre, con tarjeta en la app, sin
  ficción. Aquí sí puede haber un segundo sistema visual, más cálido, para la superficie
  del comprador, con reglas escritas de convivencia con el ink del panel.
- **Club de operadores:** encuentros trimestrales en Lima, tabla de tasas de recojo por
  agencia, comparativa anónima entre marcas. Contenido: casos reales, no personajes.
- **Compuerta:** 100.000 compradores con Kross ID; el programa de puntos se autofinancia
  con la comisión de cobro; NPS de comprador medido en el comprobante.

### Fase 3 · La app del comprador (3 → 5 años)

- Si hay cientos de miles de compradores en varias marcas, la app de comprador de Kross
  (como Shop): todas tus compras, tus puntos, tus recojos, en una sola app. Aquí el
  entretenimiento como beneficio —a la Mercado Play— puede evaluarse con datos de
  frecuencia reales.
- **Compuerta:** la app de comprador supera en frecuencia de apertura a la app promedio de
  una marca.

### Fase 4 · Marca cultural (5 → 10 años)

- Recién aquí el universo narrativo tiene a quién contarle. Y, si se hace, se hace con la
  materia prima que las fases anteriores acumularon: **historias reales de comerciantes que
  recuperaron tiempo**. Red Bull no inventó atletas; filmó a los que ya existían. La serie
  de Kross, si existe, es sobre el operador que volvió a surfear porque dejó de llamar.
- Entonces sí: series, eventos, merch, la tarjeta de invitación como objeto de culto.

**Regla del roadmap:** la narrativa se gana con datos de la fase anterior. Si en la Fase 1
el sello no convierte, no hay Fase 2. Eso protege a la empresa de construir un universo
para un producto que el mercado no pidió.

---

## 9. Pregunta 7 — Qué eliminar por completo

1. **Los minijuegos** (Drift, Reflex, Café, Run, Memoria, Tiro al blanco). No hay espera, no
   hay frecuencia, no hay fuente de puntos, y compiten con el mejor momento del producto.
   Eliminar del roadmap, no posponer.
2. **La serie como vehículo de lanzamiento.** Archivar el storyboard. Conservar la tarjeta
   de invitación y las tres líneas buenas.
3. **El club secreto y el misterio.** Sin audiencia, el misterio es ruido. Kross Club, si
   existe, tiene que poder explicarse en una frase en el paso 3 del checkout.
4. **«Cuando el dinero ya no es un problema»** y toda la iconografía de éxito (autos,
   skyline, visor VR). Es el lenguaje del gurú y quema la credibilidad con el comerciante.
5. **La estética synthwave para el panel y la web B2B.** El manual v2.0 tiene razón para
   esa audiencia. Si hay un segundo sistema visual, es solo para la superficie del
   comprador y con reglas.
6. **La portada mixta** con cifras inventadas. Dos webs: una para el comerciante (la actual,
   `propuesta.ts`), otra, más adelante, para el programa de comprador.
7. **El white-label completo como discurso, sin reemplazarlo todavía.** No se le quita a las
   marcas actuales nada hasta que el sello del paso 3 demuestre que convierte. Cuando lo
   demuestre, la marca lo pedirá.
8. **La idea de que la tecnología «desaparece».** En este negocio la tecnología es la
   confianza. El comprobante firmado, la clave de recojo y el «pago recibido en 6.6 s» son
   la historia. No las escondas; son lo único que un competidor no puede dibujar.

---

## 10. Pregunta 9 — ¿Sube LTV, retención, frecuencia, NPS, valor percibido y fidelidad?

Separando lo que el concepto propone de lo que este documento propone en su lugar.

| Métrica | Universo narrativo + juegos | Kross ID + adelanto protegido + puntos de coalición | Mecanismo |
|---|---|---|---|
| **Conversión paso 3** (la que decide todo) | Sin efecto | **Sí, medible** | Un tercero conocido responde por el adelanto; baja el riesgo percibido de pagar S/95 a una tienda desconocida (misma lógica que Compra Protegida) |
| **LTV por comprador** | Sin efecto | Sí, indirecto | Un toque en cualquier tienda Kross baja la fricción de recompra y de compra cruzada; los puntos que valen en más lugares se acumulan en vez de expirar |
| **Retención de la marca (churn de tienda)** | Neutro o negativo (roba tiempo de desarrollo) | Sí | Una tienda cuyos compradores ya tienen Kross ID pierde conversión si se va. Es el costo de cambio de Shop Pay |
| **Frecuencia de uso** | Pico de curiosidad y caída a cero (§5) | Sube con el número de tiendas | La frecuencia la crea el conjunto de tiendas, no una app sola |
| **NPS del comprador** | Sin dato; riesgo de irritación post-pago | Sí | Certeza sobre el dinero + un toque + protección. Medir en el comprobante |
| **Valor percibido por la tienda** | Bajo: no resuelve entrega, cobranza ni boletas | Alto si el sello convierte | La tienda ve conversión y recojo en su panel, en horas y en soles |
| **Fidelidad hacia la plataforma** | Del comprador hacia la marca de la tienda, no hacia Kross | Del comprador hacia Kross | El comprador pide «¿aceptan Kross?» porque le protege el adelanto; la tienda no puede irse sin perderlo |

**Mecanismo psicológico, dicho exactamente:** en un mercado donde el comprador no confía
en pagar antes, el valor emocional está en **reducir el riesgo percibido**, no en el
placer. Aversión a la pérdida: perder S/95 pesa más que ganar 50 puntos. El sello de un
tercero, la devolución garantizada y el recibo inmediato atacan la pérdida; el juego ofrece
una ganancia minúscula que no compensa nada.

**Mecanismo de negocio, dicho exactamente:** costo de cambio para la tienda y efecto de red
de dos lados. Cada tienda añade lugares donde el Kross ID vale; cada comprador con Kross
ID hace que la tienda siguiente convierta mejor. Eso es defendible. Un universo, no.

---

## 11. Pregunta 10 — La mirada de un fondo

**Como está planteado: distrae del producto principal.** Un fondo que mire a Kross en
septiembre de 2026 ve una empresa con dos marcas, veinte pedidos, un cobro real de hace
dos semanas y una tensión abierta sobre su parámetro más importante (el adelanto). Un plan
de universo narrativo con series, juegos y marca cultural en esa foto se lee como falta de
foco, y en pre-semilla el foco es lo único que se valora.

Argumentos por disciplina:

- **Branding.** Las marcas culturales citadas (Harley, Red Bull, LEGO, Patagonia) construyeron
  la cultura sobre décadas de producto amado. Una marca cultural autorada antes del producto
  es, en el mejor caso, cara, y en el peor, un proyecto cripto de 2021.
- **Psicología del consumidor.** El comprador COD peruano tiene un problema de confianza,
  no de aburrimiento. Invertir en el problema equivocado.
- **Estrategia.** Kross ya hizo un giro de ICP (Sales → LTV) y un cambio de posicionamiento
  (contraentrega → cobro anticipado) en el mismo año. Un tercer giro hacia «marca cultural»
  sin cerrar los anteriores es el patrón que un inversionista llama *estrategia por
  agotamiento*.
- **Economía de plataformas.** Lo que un fondo sí paga caro es el activo de red: compradores
  identificados que cruzan tiendas y volumen de pagos por los rieles de Kross (TPV). Shopify
  se valora en buena parte por los pagos, no por el software. Kross vive de una comisión
  por cobro: **cada punto que sube la conversión del paso 3 es ingreso directo**, y cada
  compra cruzada por Kross ID también. Eso es lo que hay que mostrarle a un fondo.
- **SaaS.** Retención neta de ingresos, tiendas activas, costo de adquisición. El universo
  no mueve ninguna. La comunidad de operadores sí mueve la adquisición (referidos) y es
  barata.
- **E-commerce.** Las demandas confirmadas por los operadores son boleta, guía, cobranza y
  recojo. Un fondo que hable con dos clientes escuchará eso y preguntará por qué el equipo
  está haciendo un runner.
- **Efectos de red.** Solo el Kross ID y los puntos de coalición tienen efecto de red. Y
  ambos tienen su propio riesgo: el subsidio de puntos antes del volumen. Un fondo lo
  aceptaría como plan de Fase 2 con compuertas, no como plan de lanzamiento.

**Cuándo el mismo fondo cambiaría de opinión:** cuando Kross ID esté en más de una tienda,
el sello convierta y los compradores pregunten por Kross. En ese punto la marca de
consumidor es un multiplicador del activo de red y sube el valor de la empresa. La
secuencia importa más que la idea.

---

## 12. Lo que sobrevive: el concepto, reescrito

### 12.1 La arquitectura de marca

| Nivel | Nombre | Audiencia | Sistema visual | Promesa |
|---|---|---|---|---|
| Empresa y panel | **Kross** | Comerciante, equipo, inversionista | Ink y lima, manual v2.0 | «La tecnología de tu tienda. Te devuelve horas.» |
| Programa de comprador | **Kross Club** | Comprador final, en el paso 3 y el comprobante | Un segundo sistema, cálido, con reglas de convivencia escritas; definir en Fase 2 | «Tu adelanto está protegido. Compras con un toque en cualquier tienda Kross. Tus puntos valen en todas.» |
| Comunidad | **Los operadores** (nombre por definir) | Dueños de marcas Kross | El de Kross | «Aquí sí se habla de negocios: tasas de recojo, agencias, cobranza.» |

Esto resuelve el conflicto con el manual: el manual manda en Kross; Kross Club es otro
nivel con su propio sistema, y el nombre deja de ser «uso incorrecto» porque ahora designa
una cosa distinta a la empresa.

### 12.2 «Vuelve a jugar», en su sitio

La frase es del comerciante. Se sostiene con una cifra en el panel («horas devueltas esta
semana») y se usa en tres lugares: la tarjeta de invitación física, la pantalla de
bienvenida del panel y el correo semanal de resumen. Nunca en la app del comprador, que
no pidió jugar.

### 12.3 Experimentos baratos con criterio de muerte

| Experimento | Costo | Qué mide | Muere si |
|---|---|---|---|
| Sello «Adelanto protegido por Kross» en el paso 3, A/B con el `checkout_ab_mode` existente | Días de front + reglas del programa | Conversión del paso 3 | No sube conversión de forma medible con 300 sesiones por brazo |
| Tarjeta física «Ya trabajaste suficiente por hoy» a 50 operadores COD con código de demo | Impresión + envío | Tasa de activación de demo | Menos de 5 activaciones |
| Contador de horas devueltas en el panel | Una semana de front | Si el comerciante lo menciona sin que se le pregunte | Nadie lo menciona en 30 días |
| Un carrusel de Instagram con la voz (sin universo, sin anime IA): un operador real, su tasa de recojo antes y después | Un ilustrador o fotógrafo, una vez | Guardados y mensajes de comerciantes | Cero mensajes de comerciantes |
| Descuento en el saldo por recoger en 48 h | Configuración | Tasa de recojo contra el 65–73 % de línea base | No mueve la tasa |

Todo lo demás —serie, juegos, app de comprador, universo— espera a sus compuertas.

---

## 13. Anexo: notas sobre las piezas visuales

Para que la crítica sea útil pieza por pieza.

- **Storyboard Episodio 1 (18 cuadros).** Los cuadros 1–3 y 13–16 tienen el tono correcto:
  cansancio, duda, «él elige cómo vivirla». Los cuadros 6–12 (visor VR, «todo se apaga»,
  fiesta, beso, auto de lujo, «cuando el dinero ya no es un problema») son otro anuncio,
  el de la escapada de lujo, y anulan el insight. Si algún día se produce, el episodio es
  el 1–5 más el 13–18, y lo que hay «dentro» del club es un tipo con una tabla de surf y
  el celular en modo avión porque los cobros entraron solos.
- **Historieta (10 cuadros).** Mejor que el storyboard. El cuadro 2 (los mensajes «¿sigue
  disponible? ¿aceptan Yape?» a la 1:37 AM) es la mejor imagen de todo el material: es el
  problema real del operador, dicho sin explicar. El cuadro 9 («deja aquí tu celular») va
  contra el producto. El cuadro 10 promete un capítulo 2 que no puede pagarse hoy.
- **Pantallas de juegos.** Están bien hechas y por eso son peligrosas: hacen parecer
  decidido algo que no ha pasado por ninguna pregunta de negocio. «Un juego siempre es una
  buena idea» es una afirmación que este documento contradice con evidencia.
- **Landing «Vuelve a jugar».** Mezcla cuatro audiencias, usa cifras inventadas, y el
  bloque «para comercios que piensan en grande» es el único que un comerciante leería, en
  el cuarto scroll. El pie —«el juego nunca terminó, solo dejaste de jugar»— es una línea
  buena en el sitio equivocado.

---

## 14. Lo que este documento no sabe

- No hay dato de conversión del paso 3 ni de tasa de recojo propia. Todo lo dicho sobre
  confianza se apoya en las entrevistas del 20-ago y en analogías (Mercado Libre, Shop
  Pay); el A/B del sello lo confirmará o no.
- Los costos de contenido y los benchmarks de retención de juegos son órdenes de magnitud
  de industria, no presupuestos.
- Si el equipo decide que la marca cultural es el objetivo aun sabiendo el costo, este
  documento no puede impedirlo; solo pide que la decisión se tome con las compuertas de §8
  escritas, para que dentro de un año se pueda saber si se cumplió o no.

## Ver también

- `10-MANUAL-DE-MARCA.md` — el sistema que este concepto contradice y que este documento
  propone mantener para el nivel Kross.
- `ICP Sales/VALIDACION-AGENCIA.md` — la voz de los operadores; la evidencia sobre qué se
  rompe al escalar y sobre el recojo.
- `03-LOYALTY-ENGINE.md` — de dónde salen hoy los puntos (del margen de la marca).
- `07-CONTRATO-360PAY.md` — de qué vive Kross: la comisión por cobro que financiaría
  cualquier programa de comprador.
- `08-RECORDATORIOS-RECOJO.md` — la espera real y cómo se ataca.
