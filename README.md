# ARC Market

Aplicación de cotizaciones para móvil con Expo y una aplicación nativa complementaria para Wear OS. ARC usa Twelve Data en móvil y reloj para que ambos muestren la misma cotización. La búsqueda de símbolos usa Yahoo Finance. La lista y el libro de posiciones se guardan en el teléfono y la app no envía órdenes.

## Aplicación móvil

Requiere Node.js 20 o posterior.

```sh
npm install
npx expo start
```

Las cotizaciones se consultan con `EXPO_PUBLIC_TWELVE_DATA_API_KEY` desde `.env`. En web, Expo reenvía las solicitudes permitidas de mercado mediante `/market-proxy`.

### Cotización de prueba en streaming

Las cotizaciones iniciales e históricas de Expo y Wear usan `time_series` de Twelve Data; ambas consultan la última vela diaria para el precio principal. El ticker seleccionado intenta conectarse al WebSocket de Twelve Data cuando `EXPO_PUBLIC_TWELVE_DATA_API_KEY` está configurada en `.env`. La clave `demo` no autoriza WebSocket. Crea una cuenta Basic gratuita y agrega tu clave; después reinicia Expo. El plan gratis permite una conexión y hasta ocho símbolos habilitados para prueba; si el símbolo no está autorizado, ARC continúa con actualización HTTP automática cada 15 segundos.

La clave configurada en `EXPO_PUBLIC_*` se incluye en el cliente compilado. Úsala solo con una clave de prueba para el proyecto escolar; no publiques una clave personal.

En Android Studio, la app Wear lee `TWELVE_DATA_API_KEY` desde `android/local.properties`. Ese archivo local está excluido del control de versiones. Móvil y reloj comparten la misma clave Basic, así que no pueden transmitir simultáneamente con el límite de una conexión.

## Wear OS

Abre `android/` en Android Studio y ejecuta el módulo `wear`. La esfera muestra las cotizaciones de AAPL, NVDA, MSFT, AMZN y TSLA. Toca para avanzar al siguiente símbolo, mantén pulsado para actualizar y, si el WebSocket no está disponible, refresca automáticamente cada 15 segundos mientras la app está activa. Necesita conexión a internet.

El módulo del reloj es nativo de Android. La interfaz Expo actual no se compila como una app de reloj ni incluye un destino watchOS.

## Avisos de precio

El móvil y Wear OS muestran una notificación local cuando reciben un precio distinto, ya sea por el stream o por la lectura automática. Acepta el permiso de notificaciones del sistema en cada dispositivo. En Expo Go se admiten notificaciones locales; las notificaciones push remotas cuando la app está cerrada necesitan un servidor de mercado, tokens y credenciales de APNs/FCM, que este proyecto escolar no tiene configurados.
