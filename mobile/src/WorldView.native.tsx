import React from 'react';
import { WebView } from 'react-native-webview';
export default function WorldView({url}:{url:string}) {
  return <WebView source={{uri:url}} style={{flex:1,backgroundColor:'#07121d'}} javaScriptEnabled domStorageEnabled allowsInlineMediaPlayback />;
}
