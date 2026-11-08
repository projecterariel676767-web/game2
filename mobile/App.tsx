import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { ActivityIndicator, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Speech from 'expo-speech';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import WorldView from './src/WorldView';
import { io } from 'socket.io-client';
import { API, api, getToken, saveToken } from './src/api';
import { VEHICLES } from './src/vehicles';

type Tab = 'drive' | 'world' | 'ai' | 'pin';
const tabs: {id:Tab;label:string;icon:string}[] = [{id:'world',label:'Earth',icon:'🌍'},{id:'drive',label:'Hangar',icon:'🚘'},{id:'ai',label:'AI Communication',icon:'✦'},{id:'pin',label:'Pin System',icon:'⌖'}];
function AINebula({active=false}:{active?:boolean}) {
  const pulse=useRef(new Animated.Value(0)).current;
  const drift=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    const a=Animated.loop(Animated.sequence([
      Animated.timing(pulse,{toValue:1,duration:2600,useNativeDriver:true,easing:Easing.inOut(Easing.sin)}),
      Animated.timing(pulse,{toValue:0,duration:2600,useNativeDriver:true,easing:Easing.inOut(Easing.sin)})
    ]));
    const b=Animated.loop(Animated.timing(drift,{toValue:1,duration:18000,useNativeDriver:true,easing:Easing.linear}));
    a.start();b.start();return()=>{a.stop();b.stop()};
  },[pulse,drift]);
  const spin=drift.interpolate({inputRange:[0,1],outputRange:['0deg','360deg']});
  const scale=pulse.interpolate({inputRange:[0,1],outputRange:[0.92,active?1.18:1.08]});
  const glow=pulse.interpolate({inputRange:[0,1],outputRange:[0.45,active?0.95:0.72]});
  return <View style={s.nebulaStage}>
    <Animated.View style={[s.nebulaHalo,{opacity:glow,transform:[{scale}]}]}/>
    <Animated.View style={[s.nebulaCloud,s.nebulaCloudA,{transform:[{rotate:spin},{scale}]}]}/>
    <Animated.View style={[s.nebulaCloud,s.nebulaCloudB,{transform:[{rotate:spin},{scale:scale}]}]}/>
    <Animated.View style={[s.nebulaCloud,s.nebulaCloudC,{transform:[{rotate:spin},{scale}]}]}/>
    <Animated.View style={[s.nebulaCloud,s.nebulaCloudD,{transform:[{rotate:spin},{scale}]}]}/>
    <Animated.View style={[s.nebulaCore,{opacity:glow,transform:[{scale}]}]}/>
    <View style={s.nebulaSpark}><Text style={s.nebulaGlyph}>✦</Text></View>
  </View>;
}


export default function App() {
  const [token,setToken]=useState(false), [loading,setLoading]=useState(true), [mode,setMode]=useState<'login'|'register'>('register');
  const [nickname,setNickname]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState('');
  const [tab,setTab]=useState<Tab>('world'),[user,setUser]=useState<any>(null);
  const [vehicle,setVehicle]=useState('sports-coupe'),[earth,setEarth]=useState('aerial'),[weather,setWeather]=useState('none'),[opacity,setOpacity]=useState('0.65'),[camera,setCamera]=useState('driver');
  const [query,setQuery]=useState(''),[route,setRoute]=useState<any>(null),[countryInfo,setCountryInfo]=useState<any>(null),[clockNow,setClockNow]=useState(new Date()),[aiText,setAiText]=useState(''),[messages,setMessages]=useState<any[]>([]),[images,setImages]=useState<string[]>([]),[weatherInfo,setWeatherInfo]=useState<any>(null),[busy,setBusy]=useState(false);
  const [pinEnabled,setPinEnabled]=useState(true),[online,setOnline]=useState(true),[onlineCount,setOnlineCount]=useState(0),[chatMessages,setChatMessages]=useState<any[]>([]),[chatText,setChatText]=useState('');
  const socketRef=useRef<any>(null);
  const audioRecorder=useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState=useAudioRecorderState(audioRecorder);

  useEffect(()=>{(async()=>{try{const t=await getToken(); if(t){const d=await api('/api/auth/me');setUser(d.user);setToken(true); const s=await api('/api/settings'); const x=s.settings||{};setVehicle(x.vehicleId||'sports-coupe');setEarth(x.earth||'aerial');setWeather(x.weather||'none');setOpacity(String(x.opacity??0.65));setCamera(x.cameraMode||'driver');setRoute(x.route||null); const h=await api('/api/ai/history');setMessages(h.messages||[]);}}catch{}finally{setLoading(false)}})()},[]);
  useEffect(()=>{if(!token||!online)return;const socket=io(API,{transports:['polling'],upgrade:false,reconnection:true,reconnectionAttempts:Infinity,reconnectionDelay:1000,reconnectionDelayMax:5000,timeout:20000});socketRef.current=socket;socket.on('chat:message',(message:any)=>setChatMessages(v=>[...v,message]));socket.on('players:snapshot',(players:any[])=>setOnlineCount(players.length));socket.on('player:updated',()=>setOnlineCount(v=>v+1));socket.on('player:left',()=>setOnlineCount(v=>Math.max(0,v-1)));return()=>{socket.disconnect();socketRef.current=null}},[token,online,route,user,vehicle]);
  const sendWorldChat=()=>{const text=chatText.trim();if(!text||!socketRef.current)return;socketRef.current.emit('chat:send',{nickname:user?.nickname||'Driver',text});setChatText('')};
  const persist=async(patch:any)=>{try{await api('/api/settings',{method:'PUT',body:JSON.stringify(patch)})}catch(e:any){setError(e.message)}};
  const handleMapRoute=(value:any)=>{setRoute(value);setQuery(value.label||value.lat+', '+value.lon);persist({route:value})};
  useEffect(()=>{if(Platform.OS!=='web')return;const listener=(event:any)=>{if(event.data?.type==='routeSelected')handleMapRoute(event.data)};window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener)},[]);
  const auth=async()=>{setBusy(true);setError('');try{const d=await api('/api/auth/'+(mode==='register'?'register':'login'),{method:'POST',body:JSON.stringify({nickname,email,password})});await saveToken(d.token);setUser(d.user);setToken(true)}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const logout=async()=>{if(Platform.OS==='web')localStorage.removeItem('pin-drive-token');else {const SecureStore=await import('expo-secure-store');await SecureStore.deleteItemAsync('pin-drive-token')}setToken(false);setUser(null)};
  const chooseVehicle=(id:string)=>{setVehicle(id);persist({vehicleId:id})};
  const locate=async()=>{setBusy(true);try{const d=await api('/api/geocode?q='+encodeURIComponent(query));setRoute(d);persist({route:d});setTab('world')}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  const toggleVoice=async()=>{try{if(recorderState.isRecording){await audioRecorder.stop();const uri=audioRecorder.uri;if(!uri)throw new Error('Audio recording was not saved.');const file=await fetch(uri);const blob=await file.blob();const form=new FormData();form.append('audio',blob,'voice.m4a');const t=await getToken();const response=await fetch(API+'/api/ai/voice',{method:'POST',headers:t?{Authorization:'Bearer '+t}:{},body:form});const d=await response.json();if(!response.ok)throw new Error(d.error||'Voice request failed.');setMessages(v=>[...v,{role:'user',content:d.transcript},{role:'assistant',content:d.answer}]);if(d.answer)Speech.speak(d.answer,{rate:0.96})}else{const permission=await AudioModule.requestRecordingPermissionsAsync();if(!permission.granted)throw new Error('Microphone permission was denied.');await setAudioModeAsync({allowsRecording:true,playsInSilentMode:true});await audioRecorder.prepareToRecordAsync();audioRecorder.record()}}catch(e:any){setError(e.message)}};
  const sendImage=async()=>{const prompt=aiText.trim();if(!prompt)return;setBusy(true);try{const d=await api('/api/ai/image',{method:'POST',body:JSON.stringify({prompt})});setImages(v=>[d.image,...v]);setAiText('')}catch(e:any){setError(e.message)}finally{setBusy(false)}};
  useEffect(()=>{if(!route)return;(async()=>{try{const d=await api('/api/weather?lat='+route.lat+'&lon='+route.lon);setWeatherInfo(d)}catch{setWeatherInfo(null)}})()},[route]);
  useEffect(()=>{const timer=setInterval(()=>setClockNow(new Date()),1000);return()=>clearInterval(timer)},[]);
  useEffect(()=>{if(!route)return;(async()=>{try{const r=await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude='+encodeURIComponent(route.lat)+'&longitude='+encodeURIComponent(route.lon)+'&localityLanguage=en');if(!r.ok)throw new Error('Country lookup failed');const d=await r.json();const code=String(d.countryCode||'').toUpperCase();setCountryInfo({code,name:d.countryName||'Unknown country',locality:d.city||d.locality||''});}catch{setCountryInfo(null)}})()},[route]);

  const sendAI=async()=>{const text=aiText.trim();if(!text)return;setMessages(v=>[...v,{role:'user',content:text}]);setAiText('');setBusy(true);try{const d=await api('/api/ai/message',{method:'POST',body:JSON.stringify({message:text})});setMessages(v=>[...v,{role:'assistant',content:d.answer}])}catch(e:any){setMessages(v=>[...v,{role:'assistant',content:'AI service: '+e.message}])}finally{setBusy(false)}};
  const selectedVehicle=VEHICLES.find(v=>v.id===vehicle); const worldUrl=API+'/preview/world.html?earth='+encodeURIComponent(earth)+'&weather='+encodeURIComponent(weather)+'&opacity='+encodeURIComponent(opacity)+'&camera='+encodeURIComponent(camera)+'&vehicle='+encodeURIComponent(vehicle)+'&vehicleId='+encodeURIComponent(vehicle)+'&vehicleName='+encodeURIComponent(selectedVehicle?.name||'Vehicle')+'&nickname='+encodeURIComponent(user?.nickname||'Driver')+'&apiBase='+encodeURIComponent(API)+(route?'&lat='+encodeURIComponent(route.lat)+'&lon='+encodeURIComponent(route.lon):'');
  if(loading)return <View style={s.center}><ActivityIndicator color="#66e3c4"/><Text style={s.muted}>Loading Pin Drive…</Text></View>;
  if(!token)return <View style={s.authPage}><View style={s.authCard}><Text style={s.brand}>PIN <Text style={{color:'#62e6c5'}}>DRIVE</Text></Text><Text style={s.subtitle}>A world without boundaries.</Text><Text style={s.heading}>{mode==='register'?'Create your driver account':'Welcome back'}</Text>{mode==='register'&&<TextInput style={s.input} placeholder="Nickname" placeholderTextColor="#7f8c9a" value={nickname} onChangeText={setNickname}/>}<TextInput style={s.input} placeholder="Email address" placeholderTextColor="#7f8c9a" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/><TextInput style={s.input} placeholder="Password (8+ characters)" placeholderTextColor="#7f8c9a" secureTextEntry value={password} onChangeText={setPassword}/>{!!error&&<Text style={s.error}>{error}</Text>}<Pressable style={s.primary} onPress={auth} disabled={busy}><Text style={s.primaryText}>{busy?'Please wait…':mode==='register'?'CREATE ACCOUNT':'SIGN IN'}</Text></Pressable><Pressable onPress={()=>setMode(mode==='register'?'login':'register')}><Text style={s.switch}>{mode==='register'?'Already registered? Sign in':'New to Pin Drive? Create account'}</Text></Pressable></View></View>;
  return <View style={s.app}><StatusBar style="light"/><View style={s.top}><Text style={s.logo}>PIN <Text style={{color:'#62e6c5'}}>DRIVE</Text></Text><View style={s.topRight}><Text style={s.player}>● {user?.nickname||'Driver'}</Text><Pressable onPress={logout}><Text style={s.logout}>Log out</Text></Pressable></View></View>
    <View style={s.body}><View style={s.sidebar}>{tabs.map(t=><Pressable key={t.id} onPress={()=>setTab(t.id)} style={[s.nav,tab===t.id&&s.navActive]}><Text style={s.navIcon}>{t.icon}</Text><Text style={[s.navText,tab===t.id&&s.navTextActive]}>{t.label}</Text></Pressable>)}<View style={{flex:1}}/><Text style={s.online}>{online?'● ONLINE':'○ OFFLINE'}</Text><Text style={s.small}>v1.0 prototype</Text></View>
    <ScrollView style={s.content} contentContainerStyle={{padding:18}}>
      {tab==='drive'&&<><View style={s.heroRow}><View style={{flex:1}}><Text style={s.eyebrow}>GARAGE / VEHICLE SELECT</Text><Text style={s.title}>Vehicle hangar</Text><Text style={s.muted}>Select a vehicle and inspect its 3D preview before entering the world.</Text></View><View style={s.counter}><Text style={s.counterValue}>20</Text><Text style={s.counterLabel}>VEHICLES</Text></View></View><View style={s.vehicleShowcase}><View style={s.previewHead}><View><Text style={s.eyebrow}>LIVE 3D PREVIEW</Text><Text style={s.previewName}>{VEHICLES.find(v=>v.id===vehicle)?.name||'Vehicle'}</Text></View><Text style={s.previewHint}>DRAG TO ORBIT · SCROLL TO ZOOM</Text></View><View style={s.vehicleModelFrame}><WorldView url={API+'/preview/vehicle.html?id='+encodeURIComponent(vehicle)+'&name='+encodeURIComponent(VEHICLES.find(v=>v.id===vehicle)?.name||'Vehicle')}/></View><View style={s.previewFoot}><Text style={s.muted}>Interactive 3D vehicle preview</Text><Pressable onPress={()=>Linking.openURL(VEHICLES.find(v=>v.id===vehicle)?.modelPage||'https://shuriken.studio/kits/town-vehicles')}><Text style={s.link}>Browse vehicle assets ↗</Text></Pressable></View></View><Text style={s.section}>Select vehicle</Text><View style={s.vehicleGrid}>{VEHICLES.map(v=><Pressable key={v.id} onPress={()=>chooseVehicle(v.id)} style={[s.vehicleCard,vehicle===v.id&&s.selected]}><Text style={s.carIcon}>🚘</Text><Text style={s.cardTitle}>{v.name}</Text><Text style={s.muted}>{v.className}</Text>{vehicle===v.id&&<Text style={s.selectedLabel}>SELECTED ✓</Text>}</Pressable>)}</View><Text style={s.section}>Plan your route</Text><Text style={s.muted}>Search a place or enter latitude and longitude.</Text><View style={s.searchRow}><TextInput style={[s.input,{flex:1,marginBottom:0}]} placeholder="Place, address, or latitude, longitude" placeholderTextColor="#7f8c9a" value={query} onChangeText={setQuery}/><Pressable style={s.primarySmall} onPress={locate}><Text style={s.primaryText}>GO</Text></Pressable></View>{route&&<Text style={s.success}>Destination: {route.label||route.lat+', '+route.lon}</Text>}<Pressable style={s.primary} onPress={()=>setTab('world')}><Text style={s.primaryText}>ENTER WORLD</Text></Pressable></>}
      {tab==='world'&&<><Text style={s.title}>Earth</Text><Text style={s.muted}>Cesium globe · terrain · weather overlays · route navigation</Text><View style={s.mapFrame}><WorldView url={worldUrl} onRouteSelect={handleMapRoute}/></View>
<View style={s.controls}><Text style={s.controlLabel}>EARTH</Text>{['aerial','aerial-labels','road','arcgis','esri-streets','osm','topographic','natgeo','ocean','hillshade','voyager','positron','dark','opentopo','grid','coordinates','none'].map(x=><Pressable key={x} style={[s.chip,earth===x&&s.chipOn]} onPress={()=>{setEarth(x);persist({earth:x})}}><Text style={s.chipText}>{({'aerial':'Cesium Satellite','aerial-labels':'Satellite + labels','road':'Cesium Roads','arcgis':'Esri Satellite','esri-streets':'Esri Streets','osm':'OpenStreetMap','topographic':'Topographic','natgeo':'National Geographic','ocean':'Ocean','hillshade':'Hillshade','voyager':'CARTO Voyager','positron':'CARTO Light','dark':'CARTO Dark','opentopo':'OpenTopoMap','grid':'Grid','coordinates':'Coordinates','none':'No imagery'} as any)[x]}</Text></Pressable>)}</View><View style={s.controls}><Text style={s.controlLabel}>WEATHER</Text>{['none','clouds','precipitation','temperature','wind','pressure'].map(x=><Pressable key={x} style={[s.chip,weather===x&&s.chipOn]} onPress={()=>{setWeather(x);persist({weather:x})}}><Text style={s.chipText}>{x}</Text></Pressable>)}</View><View style={s.controls}><Text style={s.controlLabel}>CAMERA</Text>{['driver','chase','free'].map(x=><Pressable key={x} style={[s.chip,camera===x&&s.chipOn]} onPress={()=>{setCamera(x);persist({cameraMode:x})}}><Text style={s.chipText}>{x}</Text></Pressable>)}</View><Text style={s.muted}>Overlay opacity: {Math.round(Number(opacity)*100)}%</Text><View style={s.controls}>{['0.25','0.5','0.65','0.8','1'].map(x=><Pressable key={x} style={[s.chip,opacity===x&&s.chipOn]} onPress={()=>{setOpacity(x);persist({opacity:Number(x)})}}><Text style={s.chipText}>{Math.round(Number(x)*100)}%</Text></Pressable>)}</View>{route&&<Text style={s.success}>Route target: {route.label||route.lat+', '+route.lon}</Text>}{weatherInfo&&<View style={s.panel}><Text style={s.cardTitle}>Weather · {weatherInfo.city}, {weatherInfo.country}</Text><Text style={s.bubbleText}>{weatherInfo.temperature}°C · feels like {weatherInfo.feels_like}°C · {weatherInfo.description}</Text><Text style={s.bubbleText}>Humidity {weatherInfo.humidity}% · Wind {weatherInfo.wind} m/s</Text></View>}</>}
      {tab === 'ai' ? (
        <View style={s.aiPage}>
          <Text style={s.eyebrow}>PIN INTELLIGENCE</Text>
          <Text style={s.title}>Your AI co-driver</Text>
          <Text style={s.muted}>Talk naturally. Ask about routes, vehicles, geography and your world.</Text>
          <View style={s.aiOrbCard}>
            <AINebula active={recorderState.isRecording}/>
            <Text style={s.aiOrbTitle}>{recorderState.isRecording?'Listening to you':'Pin AI is ready'}</Text>
            <Text style={s.aiOrbCaption}>{recorderState.isRecording?'Speak clearly — your voice is being captured':'Tap the orb to start a voice conversation'}</Text>
            <Pressable style={[s.voiceOrbButton,recorderState.isRecording&&s.voiceOrbActive]} onPress={toggleVoice}>
              <Text style={s.voiceOrbButtonText}>{recorderState.isRecording?'STOP LISTENING':'✦  TALK TO PIN AI'}</Text>
            </Pressable>
          </View>
          <View style={s.chatHeader}><Text style={s.section}>Conversation</Text><Text style={s.muted}>{messages.length} messages</Text></View>
          <View style={s.chat}>
            {messages.map((m,i) => (
              <View key={i} style={[s.bubble,m.role === 'user' ? s.userBubble : s.aiBubble]}>
                <Text style={s.bubbleRole}>{m.role === 'user' ? 'YOU' : 'PIN AI'}</Text>
                <Text style={s.bubbleText}>{m.content}</Text>
              </View>
            ))}
            {busy&&<Text style={s.muted}>Pin AI is thinking…</Text>}
          </View>
          <View style={s.searchRow}>
            <TextInput style={[s.input,{flex:1,marginBottom:0}]} placeholder="Message Pin AI…" placeholderTextColor="#7f8c9a" value={aiText} onChangeText={setAiText} onSubmitEditing={sendAI}/>
            <Pressable style={s.primarySmall} onPress={sendAI}><Text style={s.primaryText}>SEND</Text></Pressable>
            <Pressable style={s.secondarySmall} onPress={sendImage}><Text style={s.secondaryText}>IMAGE</Text></Pressable>
          </View>
          {images.map((uri,i) => <Image key={i} source={{uri}} style={{width:'100%',height:260,borderRadius:14,marginVertical:8}} resizeMode="contain" />)}
        </View>
      ) : null}
      {tab==='pin'&&<><Text style={s.title}>Pin System</Text><Text style={s.muted}>Player identity, navigation pins and world preferences.</Text><View style={s.panel}><Text style={s.cardTitle}>Driver profile</Text><Text style={s.bubbleText}>Nickname: {user?.nickname}</Text><Text style={s.bubbleText}>Email: {user?.email}</Text></View><View style={s.panel}><Text style={s.cardTitle}>World systems</Text><Pressable onPress={()=>{setPinEnabled(!pinEnabled);persist({pinSystem:{enabled:!pinEnabled}})}}><Text style={s.bubbleText}>{pinEnabled?'● Pin System enabled':'○ Pin System disabled'} — tap to toggle</Text></Pressable><Pressable onPress={()=>setOnline(!online)}><Text style={s.bubbleText}>{online?'● Multiplayer presence enabled ('+onlineCount+' online)':'○ Multiplayer presence paused'} — tap to toggle</Text></Pressable></View><View style={s.panel}><Text style={s.cardTitle}>Saved preferences</Text><Text style={s.bubbleText}>Vehicle: {VEHICLES.find(v=>v.id===vehicle)?.name}</Text><Text style={s.bubbleText}>Earth: {earth} · Weather: {weather} · Camera: {camera}</Text></View><View style={s.panel}><Text style={s.cardTitle}>World chat · {onlineCount} online</Text>{chatMessages.slice(-30).map((m,i)=><Text key={i} style={s.bubbleText}><Text style={{color:'#62e6c5',fontWeight:'700'}}>{m.nickname}: </Text>{m.text}</Text>)}<View style={s.searchRow}><TextInput style={[s.input,{flex:1,marginBottom:0}]} placeholder="Message other drivers…" placeholderTextColor="#7f8c9a" value={chatText} onChangeText={setChatText} onSubmitEditing={sendWorldChat}/><Pressable style={s.primarySmall} onPress={sendWorldChat}><Text style={s.primaryText}>SEND</Text></Pressable></View></View></>}
      {!!error&&<Text style={s.error}>{error}</Text>}
    </ScrollView></View>
  </View>;
}
const s=StyleSheet.create({
 center:{flex:1,backgroundColor:'#070d1c',alignItems:'center',justifyContent:'center',gap:12},
 authPage:{flex:1,backgroundColor:'#070d1c',alignItems:'center',justifyContent:'center',padding:20},
 authCard:{width:'100%',maxWidth:460,backgroundColor:'#111b31',borderColor:'#26395c',borderWidth:1,borderRadius:24,padding:30,shadowColor:'#1b8cff',shadowOpacity:0.12,shadowRadius:28,elevation:12},
 brand:{fontSize:29,fontWeight:'900',color:'#f4f7ff',letterSpacing:2.5},
 subtitle:{color:'#91a3c4',marginTop:5,marginBottom:30},
 heading:{fontSize:23,fontWeight:'800',color:'#f4f7ff',marginBottom:18},
 input:{backgroundColor:'#0b1427',borderColor:'#2b3e63',borderWidth:1,borderRadius:12,padding:14,color:'#fff',marginBottom:12,minWidth:0},
 primary:{backgroundColor:'#5de0cb',borderRadius:12,padding:15,alignItems:'center',marginTop:10,shadowColor:'#5de0cb',shadowOpacity:0.2,shadowRadius:12},
 primarySmall:{backgroundColor:'#5de0cb',borderRadius:11,paddingHorizontal:20,justifyContent:'center',alignItems:'center'},
 primaryText:{color:'#061b27',fontWeight:'900',letterSpacing:1},
 secondarySmall:{backgroundColor:'#172747',borderColor:'#45618e',borderWidth:1,borderRadius:11,paddingHorizontal:16,justifyContent:'center',alignItems:'center'},
 secondaryText:{color:'#c7d8f7',fontWeight:'800',letterSpacing:.5},
 switch:{color:'#72e5d5',textAlign:'center',marginTop:18},
 error:{color:'#ff9b9b',marginVertical:8},success:{color:'#67e8d7',marginVertical:10},
 muted:{color:'#92a4c3',fontSize:13,marginTop:5,lineHeight:19},
 app:{flex:1,backgroundColor:'#070d1c'},
 top:{height:68,backgroundColor:'#0c1529',borderBottomWidth:1,borderBottomColor:'#1e3153',paddingHorizontal:22,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
 logo:{color:'#f4f7ff',fontSize:21,fontWeight:'900',letterSpacing:2},
 topRight:{flexDirection:'row',alignItems:'center',gap:18},
 player:{color:'#b7c7e2',fontSize:12},logout:{color:'#72e5d5',fontSize:12,fontWeight:'800'},
 body:{flex:1,flexDirection:'row'},
 sidebar:{width:126,backgroundColor:'#0b1427',padding:12,borderRightWidth:1,borderRightColor:'#1e3153'},
 nav:{paddingVertical:15,alignItems:'center',borderRadius:13,marginBottom:8,borderWidth:1,borderColor:'transparent'},
 navActive:{backgroundColor:'#142747',borderColor:'#2c5278'},
 navIcon:{fontSize:22},navText:{fontSize:11,color:'#879abb',marginTop:6},navTextActive:{color:'#73e4d4',fontWeight:'800'},
 online:{color:'#68e5cf',fontSize:10,textAlign:'center',fontWeight:'800'},
 small:{color:'#607496',fontSize:9,textAlign:'center',marginTop:8},
 content:{flex:1},title:{fontSize:29,fontWeight:'900',color:'#f3f6ff',letterSpacing:-.5},
 eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:2,color:'#70dfd2',marginBottom:8},
 section:{fontSize:18,fontWeight:'800',color:'#f3f6ff',marginTop:25,marginBottom:7},
 heroRow:{flexDirection:'row',alignItems:'center',gap:16,marginBottom:18},
 counter:{backgroundColor:'#111f39',borderWidth:1,borderColor:'#2a4167',borderRadius:15,padding:14,alignItems:'center',minWidth:78},
 counterValue:{fontSize:24,fontWeight:'900',color:'#72e5d5'},counterLabel:{fontSize:9,color:'#91a4c4',fontWeight:'800',letterSpacing:1},
 vehicleShowcase:{backgroundColor:'#101b31',borderWidth:1,borderColor:'#2b4168',borderRadius:18,padding:14,marginTop:12,shadowColor:'#163e6d',shadowOpacity:.16,shadowRadius:20},
 previewHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},
 previewName:{fontSize:20,fontWeight:'800',color:'#f4f7ff'},
 previewHint:{fontSize:9,color:'#7f96bb',letterSpacing:1,textAlign:'right'},
 vehicleModelFrame:{height:290,backgroundColor:'#091326',borderRadius:13,overflow:'hidden',marginTop:12},
 previewFoot:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8,marginTop:8},
 vehicleGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:14},
 vehicleCard:{width:'31%',minWidth:145,backgroundColor:'#111e35',borderWidth:1,borderColor:'#2a3e62',borderRadius:14,padding:14},
 selected:{borderColor:'#5de0cb',backgroundColor:'#132e3c',shadowColor:'#5de0cb',shadowOpacity:.15,shadowRadius:10},
 carIcon:{fontSize:27},cardTitle:{color:'#f4f7ff',fontWeight:'800',marginTop:7},
 selectedLabel:{color:'#6de3d4',fontSize:9,fontWeight:'900',marginTop:8,letterSpacing:1},
 link:{color:'#71e3d5',fontSize:11,fontWeight:'700',marginTop:8},
 searchRow:{flexDirection:'row',gap:8,marginTop:14,marginBottom:12,alignItems:'stretch'},
 mapFrame:{height:640,backgroundColor:'#091326',borderRadius:17,overflow:'hidden',marginTop:16,borderWidth:1,borderColor:'#2a4168'},
 controls:{flexDirection:'row',flexWrap:'wrap',gap:7,alignItems:'center',marginTop:12},
 controlLabel:{color:'#8298bc',fontSize:10,fontWeight:'900',width:75,letterSpacing:1},
 chip:{borderWidth:1,borderColor:'#30476e',borderRadius:20,paddingHorizontal:13,paddingVertical:8,backgroundColor:'#101d34'},
 chipOn:{backgroundColor:'#173b4a',borderColor:'#5de0cb'},
 chipText:{color:'#d8e4f7',fontSize:11,fontWeight:'700'},
 chat:{minHeight:220,backgroundColor:'#0d1930',borderWidth:1,borderColor:'#263b61',borderRadius:15,padding:14,marginVertical:14,gap:10},
 bubble:{maxWidth:'88%',padding:13,borderRadius:14},
 userBubble:{alignSelf:'flex-end',backgroundColor:'#174b50'},
 aiBubble:{alignSelf:'flex-start',backgroundColor:'#172642'},
 bubbleRole:{color:'#74e4d7',fontSize:9,fontWeight:'900',marginBottom:5,letterSpacing:1},
 bubbleText:{color:'#e3ebfa',fontSize:13,lineHeight:20},
 panel:{backgroundColor:'#111e35',borderWidth:1,borderColor:'#2b4168',borderRadius:15,padding:16,marginTop:14,gap:10},
 aiPage:{paddingBottom:24},
 aiOrbCard:{alignItems:'center',backgroundColor:'#0d1930',borderColor:'#2a4168',borderWidth:1,borderRadius:22,padding:18,marginTop:18,overflow:'hidden'},
 nebulaStage:{width:220,height:210,alignItems:'center',justifyContent:'center'},
 nebulaHalo:{position:'absolute',width:190,height:190,borderRadius:100,backgroundColor:'#287bd0',shadowColor:'#36bfff',shadowOpacity:.9,shadowRadius:38,elevation:16},
 nebulaCloud:{position:'absolute',width:150,height:150,borderRadius:100,borderWidth:20,shadowRadius:30},
 nebulaCloudA:{borderColor:'#49d9d0',backgroundColor:'rgba(33,128,198,0.32)',shadowColor:'#52d8ff',shadowOpacity:.8},
 nebulaCloudB:{width:116,height:116,borderWidth:17,borderColor:'#a66aff',backgroundColor:'rgba(112,67,190,0.25)',shadowColor:'#a66aff',shadowOpacity:.8},
 nebulaCloudC:{width:138,height:82,borderWidth:15,borderColor:'#ee83cb',backgroundColor:'rgba(225,95,184,0.22)',shadowColor:'#f17fd5',shadowOpacity:.85,top:18,left:-20},
 nebulaCloudD:{width:74,height:126,borderWidth:14,borderColor:'#67a8ff',backgroundColor:'rgba(65,133,230,0.22)',shadowColor:'#62b8ff',shadowOpacity:.85,top:-12,right:-18},
 nebulaCore:{position:'absolute',width:76,height:76,borderRadius:50,backgroundColor:'#8feaff',shadowColor:'#5de0ff',shadowOpacity:1,shadowRadius:32,elevation:20},
 nebulaSpark:{width:48,height:48,alignItems:'center',justifyContent:'center'},
 nebulaGlyph:{fontSize:34,color:'#fff',textShadowColor:'#7beaff',textShadowRadius:18},
 aiOrbTitle:{fontSize:20,fontWeight:'900',color:'#f4f7ff',marginTop:4},
 aiOrbCaption:{fontSize:12,color:'#91a4c4',textAlign:'center',marginTop:6},
 voiceOrbButton:{backgroundColor:'#5de0cb',borderRadius:30,paddingHorizontal:24,paddingVertical:13,marginTop:16},
 voiceOrbActive:{backgroundColor:'#ff718c'},
 voiceOrbButtonText:{color:'#071b2a',fontSize:11,fontWeight:'900',letterSpacing:1},
 chatHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:8}
});
