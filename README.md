# 🎮 Multistream Chat Overlay Personalizado

Overlay de chat unificado en tiempo real para streamers que transmiten simultáneamente en:
- 🟣 **Twitch**
- 🔴 **YouTube**
- 🟢 **Kick**
- 🎵 **TikTok Live**

---

## ✨ Características Principales

1. **4 Plataformas en 1 solo Overlay:**
   - **Twitch:** Conexión nativa IRC rápida con soporte de insignias de streamer, moderador, VIP, suscriptor y emotes oficiales.
   - **Kick:** Conexión WebSocket Pusher en tiempo real con avatares, rangos y soporte de emotes de Kick (`[emote:ID:nombre]`).
   - **YouTube:** Compatible con handles (`@canal`), enlaces de transmisión en vivo o ID de video. Soporte para SuperChats destacados y emojis personalizados.
   - **TikTok Live:** Conexión en vivo con avatares, comentarios y soporte de eventos de regalos / donaciones.

2. **Panel de Control Web Interactivo (`http://localhost:3333`):**
   - Conexión y desconexión individual por plataforma con indicadores de estado en vivo (verde, amarillo, rojo).
   - **Simulador de pruebas:** Botones para probar mensajes de Twitch, Kick, YouTube y TikTok al instante sin necesidad de estar transmitiendo en vivo.
   - **Vista previa en vivo integrada:** Observa los cambios de diseño y temas inmediatamente.
   - **Copia con un clic:** Botón directo para copiar la URL para OBS Studio / Streamlabs.

3. **Personalización Visual Total:**
   - **6 Temas Profesionales:**
     - *Glassmorphism Moderno* (Efecto vidrio esmerilado translúcido)
     - *Cyberpunk Glow* (Bordes neón estilo high-tech con cortes angulares)
     - *Neon Purple* (Estilo gamer púrpura brillante)
     - *Minimalista Oscuro* (Limpio y sobrio)
     - *Bubble Cute* (Burbujas redondeadas y coloridas)
     - *Pixel Retro* (Estilo arcade 8-bit)
   - **Tipografías:** Inter, Poppins, Rajdhani, Montserrat, Roboto y Press Start 2P.
   - **Ajustes:** Control de tamaño de fuente, opacidad del fondo, bordes redondeados, animaciones de entrada (*Slide Left*, *Slide Up*, *Pop-in*, *Fade*), tiempo para ocultar mensajes y límite de mensajes en pantalla.
   - **Alertas y Accesibilidad:** Alerta de sonido sintetizada (sin dependencias externas), Text-to-Speech (TTS con selector de voz) y filtro de palabras prohibidas/censura.

---

## 🚀 Cómo Iniciar la Aplicación

### Opción 1: Acceso Directo de Escritorio (Recomendado)
Haz doble clic en el acceso directo creado en tu escritorio:
- **`Multistream Chat Overlay`** (con su icono oficial).
Se abrirá como una **App de Escritorio nativa** con su propia ventana oscura, barra de tareas e icono en la bandeja del sistema (System Tray).

### 🛡️ Modo en Segundo Plano (Sin Interrupciones en OBS)
La aplicación está diseñada para funcionar silenciosamente en segundo plano sin estorbar en tu pantalla:
- **Cierre inteligente:** Al hacer clic en la `[X]` de la ventana o presionar el botón **`Segundo Plano`** en el panel, la ventana se oculta a la bandeja del sistema (junto al reloj de Windows).
- **OBS nunca se desconecta:** El servidor backend, los WebSockets y los chats de Twitch, Kick, YouTube y TikTok siguen 100% activos en segundo plano.
- **Icono en la Bandeja del Sistema (System Tray):**
  - **Clic izquierdo:** Muestra u oculta el panel de control.
  - **Doble clic:** Restaura la ventana principal.
  - **Clic derecho:** Menú rápido con opciones para:
    - *Abrir / Ocultar Panel de Control*
    - *Copiar URL para OBS*
    - *Ver Overlay en el Navegador*
    - *Iniciar con Windows (Segundo Plano)* (para que arranque automáticamente al encender la PC)
    - *Salir Completamente* (para cerrar todo el programa)

### Opción 2: Archivo de Inicio
Haz doble clic en **`start.bat`** o **`Iniciar-App.bat`**.

### Opción 3: Modo Servidor Clásico
Si deseas ejecutar solo el servidor web en consola:
```bash
npm run server
```

---

## 📺 Cómo Añadir a OBS Studio o Streamlabs

1. Abre **OBS Studio**.
2. En tu Escena, haz clic en el botón `+` en la sección de **Fuentes**.
3. Selecciona **Navegador** (Browser Source).
4. Asígnale un nombre (ej. `Chat Multistream`).
5. En el campo **URL**, ingresa:
   ```
   http://localhost:3333/overlay
   ```
6. Configura el tamaño recomendado:
   - **Ancho:** `450` px (o el ancho que prefieras en tu layout)
   - **Alto:** `700` px (o `800` px)
7. Asegúrate de marcar la casilla:
   - ✅ *Actualizar el navegador cuando la escena se active*
8. Haz clic en **Aceptar**. ¡Listo! El chat es 100% transparente y se integrará limpiamente sobre tu juego o cámara.

---

## ⚙️ Configuración de Plataformas

- **Twitch:** Ingresa tu usuario (ej: `ibai`). No requiere tokens ni claves API.
- **Kick:** Ingresa tu nombre de usuario o canal (ej: `westcol`, `xqc`).
- **YouTube:** Puedes ingresar:
  - Tu handle: `@MiCanal`
  - El enlace directo de la transmisión: `https://www.youtube.com/watch?v=XXXXXXXXXXX`
  - El ID del video en vivo: `XXXXXXXXXXX`
- **TikTok Live:** Ingresa tu usuario de TikTok (ej: `@streamer`). Recuerda que debes estar transmitiendo en vivo para que TikTok permita la conexión de chat.

---

## 🛠️ Tecnologías Utilizadas

- **Backend:** Node.js, Express, Socket.IO, `ws`, `tiktok-live-connector`, `youtube-chat`.
- **Frontend:** HTML5, CSS3 moderno con variables dinámicas, JavaScript ES6+, Web Audio API para efectos de sonido sin latencia.
