import React from 'react';
import { WebView } from 'react-native-webview';
export default function WorldView({url,onRouteSelect}:{url:string;onRouteSelect?:(route:any)=>void}) {
  return <WebView source={{uri:url}} style={{flex:1,backgroundColor:'#07121d'}} javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback onMessage={event=>{try{const data=JSON.parse(event.nativeEvent.data);if(data.type==='routeSelected')onRouteSelect?.(data)}catch{}}} />;
}
