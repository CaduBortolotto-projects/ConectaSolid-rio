import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, BackHandler, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Crypto from 'expo-crypto';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Category, Item, Photo, Profile, DEMO_EMAIL, DEMO_NAME, MAX_PHOTOS, STATES, itemPhotos, normalizeSearch, normalizePhone, validateItem, normalizeContactEmail, normalizeInstagram } from './src/domain';
import { isOnline, supabase } from './src/supabase';
import { Dialog } from './src/dialogs';
import { ContactsCard } from './src/ContactsCard';
import { AuthScreen } from './src/AuthScreen';
import { ProfileEditor } from './src/ProfileEditor';
import { client, profileFor, listOnline, readDemo, writeDemo, getContacts, saveOnline, statusOnline, deleteOnline, persistDemoPhotos, cleanupDemoPhotos } from './src/repository';

// Modo local persistente ou Supabase, escolhido explicitamente no arquivo .env.

const C = {
  navy: '#173456', blue: '#2376C9', blue2: '#1668BA', sky: '#E9F4FF',
  pale: '#F5F9FD', white: '#FFFFFF', muted: '#708299', line: '#E4EBF3',
  green: '#218566', lightGreen: '#E6F6F1', dark: '#1B2E45', orange: '#B77A18',
};

type Screen = 'login' | 'register' | 'home' | 'detail' | 'new' | 'profile' | 'account';
type Coords = { lat: number; lon: number };

const categories: Category[] = ['Todos', 'Roupas', 'Móveis', 'Eletrônicos', 'Livros', 'Outros'];
const icons: Record<Category, keyof typeof Ionicons.glyphMap> = {
  Todos: 'grid-outline', Roupas: 'shirt-outline', Móveis: 'bed-outline',
  Eletrônicos: 'laptop-outline', Livros: 'book-outline', Outros: 'cube-outline',
};
const categoryIllustrations: Record<Exclude<Category, 'Todos'>, number> = {
  Roupas: require('./assets/roupas.png'),
  Móveis: require('./assets/moveis.png'),
  Eletrônicos: require('./assets/eletronicos.png'),
  Livros: require('./assets/livros.png'),
  Outros: require('./assets/outros.png'),
};
const seed: Item[] = [
  { id:'d1',title:'Roupas de inverno',category:'Roupas',description:'Casacos, blusas e roupas em bom estado. Itens limpos e separados para doação.',city:'Caxias do Sul',state:'RS',image:'',owner:'Marina',ownerId:'demo-seed-1',lat:-29.1683,lon:-51.1794,status:'disponivel',date:'Hoje' },
  { id:'d2',title:'Livros de literatura',category:'Livros',description:'Livros variados, ideais para estudantes e amantes de leitura.',city:'Caxias do Sul',state:'RS',image:'',owner:'Instituto Exemplo',ownerId:'demo-seed-2',lat:-29.1587,lon:-51.1961,status:'disponivel',date:'Ontem' },
  { id:'d3',title:'Cama de solteiro',category:'Móveis',description:'Cama de solteiro usada em boas condições. Necessita retirada no local.',city:'Farroupilha',state:'RS',image:'',owner:'Rafael',ownerId:'demo-seed-3',lat:-29.2244,lon:-51.3481,status:'disponivel',date:'Há 2 dias' },
  { id:'d4',title:'Notebook usado',category:'Eletrônicos',description:'Notebook mais antigo, funcionando para tarefas básicas.',city:'Bento Gonçalves',state:'RS',image:'',owner:'Ana',ownerId:'demo-seed-4',lat:-29.1706,lon:-51.5185,status:'disponivel',date:'Há 3 dias' },
  { id:'d5',title:'Brinquedos infantis',category:'Outros',description:'Brinquedos em bom estado, para crianças de diferentes idades.',city:'Caxias do Sul',state:'RS',image:'',owner:'Clara',ownerId:'demo-seed-5',lat:-29.1829,lon:-51.1810,status:'disponivel',date:'Há 4 dias' },
];
// Local aproximado de referência somente para a prévia: não é a localização real do usuário.
const demoPosition: Coords = { lat: -29.1683, lon: -51.1794 };
function distance(a: Coords, b: Coords): number {
  const rad = (n:number) => n * Math.PI / 180;
  const dLat = rad(b.lat-a.lat), dLon = rad(b.lon-a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
const formatDistance = (km?:number) => km == null ? 'Distância não informada' : `${km < 10 ? km.toFixed(1).replace('.',',') : Math.round(km)} km`;
const shortName = (name:string) => name.trim().split(' ')[0] || 'Visitante';

function Symbol({ name, size=20, color=C.navy }: { name:keyof typeof Ionicons.glyphMap;size?:number;color?:string }) {
  return <Ionicons name={name} size={size} color={color}/>;
}
function Button({label,onPress,icon,secondary=false,disabled=false}:{label:string;onPress:()=>void;icon?:keyof typeof Ionicons.glyphMap;secondary?:boolean;disabled?:boolean}) {
  return <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.button,secondary&&s.buttonAlt,disabled&&{opacity:.55},pressed&&{opacity:.83}]}>
    {icon && <Symbol name={icon} color={secondary?C.blue:C.white} size={19}/>}<Text style={[s.buttonText,secondary&&{color:C.blue}]}>{label}</Text>
  </Pressable>;
}
function Field({label,value,onChange,placeholder,multiline=false,keyboardType='default',secure=false,icon,maxLength}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;multiline?:boolean;keyboardType?:'default'|'email-address'|'phone-pad';secure?:boolean;icon?:keyof typeof Ionicons.glyphMap;maxLength?:number}){
  const [focused,setFocused]=useState(false);
  return <View style={{marginBottom:15}}><Text style={s.label}>{label}</Text><View style={[s.inputWrap,multiline&&{alignItems:'flex-start',minHeight:120},focused&&s.inputFocus]}>{icon&&<Symbol name={icon} size={18} color={C.muted}/>}<TextInput style={[s.input,multiline&&{height:104,textAlignVertical:'top'}]} multiline={multiline} value={value} onChangeText={onChange} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} underlineColorAndroid="transparent" placeholder={placeholder} placeholderTextColor="#95A4B6" autoCapitalize={keyboardType==='email-address'?'none':'sentences'} keyboardType={keyboardType} secureTextEntry={secure} selectionColor={C.blue} cursorColor={C.blue} maxLength={maxLength??(multiline?2000:keyboardType==='phone-pad'?22:150)} accessibilityLabel={label}/></View></View>;
}
function SearchBar({value,onChange}:{value:string;onChange:(value:string)=>void}){
  const [focused,setFocused]=useState(false);
  return <View style={[s.searchBar,focused&&s.inputFocus]}><Symbol name="search-outline" size={21} color={C.muted}/><TextInput style={[s.input,{height:52,minHeight:52,paddingVertical:12,lineHeight:24}]} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} underlineColorAndroid="transparent" selectionColor={C.blue} cursorColor={C.blue} accessibilityLabel="Buscar produto ou cidade" placeholder="Busque por produto ou cidade" placeholderTextColor="#94A3B7" value={value} onChangeText={onChange}/>{!!value&&<Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" onPress={()=>onChange('')}><Symbol name="close-circle" color={C.muted}/></Pressable>}</View>;
}

function PhotoGallery({photos,onAdd,onRemove,onCover,onOpen,placeholder}:{photos:Photo[];onAdd?:()=>void;onRemove?:(id:string)=>void;onCover?:(id:string)=>void;onOpen:(index:number)=>void;placeholder?:number}){
  const [active,setActive]=useState(0);
  const index=Math.min(active,Math.max(0,photos.length-1));
  return <View style={{marginBottom:22}}>
    {photos.length?<Pressable accessibilityRole="button" accessibilityLabel={`Ampliar foto ${index+1}`} style={s.photoFrame} onPress={()=>onOpen(index)}><Image source={{uri:photos[index].uri}} resizeMode="contain" style={s.fullPhoto}/><Text style={s.photoHint}>⤢ Toque para ampliar</Text></Pressable>:
      <View style={s.photoFrame}>{placeholder?<Image source={placeholder} resizeMode="contain" style={s.fullPhoto}/>:<><Symbol name="images-outline" size={40} color={C.blue}/><Text style={s.uploadTitle}>Mostre o produto</Text><Text style={s.uploadText}>Adicione fotos pelo botão abaixo</Text></>}</View>}
    {!!onAdd&&<View style={s.galleryBar}><Text style={s.photoCaption}>{photos.length}/6 fotos</Text><Pressable accessibilityRole="button" disabled={photos.length>=MAX_PHOTOS} onPress={onAdd} style={[s.addPhotos,photos.length>=MAX_PHOTOS&&{opacity:.45}]}><Text style={{color:C.blue,fontWeight:'800'}}>＋ Adicionar fotos</Text></Pressable></View>}
    {!!photos.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:9,paddingVertical:9}}>{photos.map((photo,i)=><View key={photo.id} style={{width:76}}><Pressable accessibilityRole="button" accessibilityLabel={`Selecionar foto ${i+1}`} onPress={()=>{if(onCover){onCover(photo.id);setActive(0);}else setActive(i);}} style={[s.photoThumb,index===i&&{borderColor:C.blue}]}><Image source={{uri:photo.uri}} resizeMode="contain" style={{width:'100%',height:'100%'}}/></Pressable>{onRemove&&<Pressable accessibilityRole="button" accessibilityLabel={`Remover foto ${i+1}`} onPress={()=>onRemove(photo.id)} style={s.removePhoto}><Text style={{fontSize:11,color:'#A23636'}}>Remover</Text></Pressable>}</View>)}</ScrollView>}
    <Text style={s.photoCaption}>{onAdd?'Até 6 fotos. Toque na miniatura para definir a capa.':'Fotos exibidas inteiras, sem cortes.'}</Text>
  </View>;
}
function PhotoViewer({value,onClose}:{value:{photos:Photo[];index:number}|null;onClose:()=>void}){
  const {width,height}=useWindowDimensions();const [index,setIndex]=useState(0);const [zoom,setZoom]=useState(false);
  useEffect(()=>{setIndex(value?.index||0);setZoom(false);},[value]);
  if(!value)return null;const photos=value.photos;const photo=photos[index];if(!photo)return null;
  const move=(step:number)=>{setIndex((index+step+photos.length)%photos.length);setZoom(false);};
  return <Modal transparent animationType="fade" visible onRequestClose={onClose}><SafeAreaView style={{flex:1,backgroundColor:'#091A2BF5'}}><View style={s.viewerBar}><Text style={{color:'white',fontWeight:'800',flex:1}}>Fotos do produto</Text><Pressable accessibilityRole="button" accessibilityLabel="Fechar visualizador" onPress={onClose} style={s.viewerButton}><Symbol name="close" color="white" size={25}/></Pressable></View>
    <View style={{flex:1,overflow:'hidden'}}><ScrollView horizontal contentContainerStyle={{flexGrow:1,justifyContent:'center'}}><ScrollView contentContainerStyle={{flexGrow:1,justifyContent:'center'}}><Image source={{uri:photo.uri}} resizeMode="contain" style={{width:width*(zoom?2:1),height:Math.max(200,height-180)*(zoom?2:1)}}/></ScrollView></ScrollView></View>
    <View style={[s.viewerBar,{justifyContent:'center',gap:18}]}><Pressable accessibilityRole="button" accessibilityLabel="Foto anterior" disabled={photos.length<2} onPress={()=>move(-1)} style={s.viewerButton}><Symbol name="chevron-back" color="white"/></Pressable><Text style={{color:'white'}}>{index+1} / {photos.length}</Text><Pressable accessibilityRole="button" accessibilityLabel="Próxima foto" disabled={photos.length<2} onPress={()=>move(1)} style={s.viewerButton}><Symbol name="chevron-forward" color="white"/></Pressable><Pressable accessibilityRole="button" onPress={()=>setZoom(!zoom)} style={s.viewerButton}><Text style={{color:'white'}}>{zoom?'Ajustar':'Ampliar'}</Text></Pressable></View>
  </SafeAreaView></Modal>;
}

export default function App(){return <SafeAreaProvider><ConectaApp/></SafeAreaProvider>;}
function ConectaApp(){
  const [screen,setScreen]=useState<Screen>('login');
  const [displayName,setDisplayName]=useState('');
  const [loggedId,setLoggedId]=useState('');
  const [email,setEmail]=useState(isOnline?'':DEMO_EMAIL);
  const [password,setPassword]=useState('');
  const [registerName,setRegisterName]=useState(isOnline?'':DEMO_NAME);
  const [registerEmail,setRegisterEmail]=useState(isOnline?'':DEMO_EMAIL);
  const [accountType,setAccountType]=useState<'Pessoa física'|'ONG'>('Pessoa física');
  const [items,setItems]=useState<Item[]>(isOnline?[]:seed);
  const [loggedProfile,setLoggedProfile]=useState<Profile|null>(null);
  const profileRef=useRef<Profile|null>(null);
  const sessionVersion=useRef(0);
  const [selected,setSelected]=useState<Item|null>(null);
  const [search,setSearch]=useState('');
  const [category,setCategory]=useState<Category>('Todos');
  const [maxDistance,setMaxDistance]=useState<number|null>(null);
  const [gps,setGps]=useState<Coords|null>(null);
  const [gpsStatus,setGpsStatus]=useState<'demo'|'real'|'denied'>('demo');
  const [draftTitle,setDraftTitle]=useState('');
  const [draftDescription,setDraftDescription]=useState('');
  const [draftCategory,setDraftCategory]=useState<Exclude<Category,'Todos'>>('Roupas');
  const [draftCity,setDraftCity]=useState('');
  const [draftPhone,setDraftPhone]=useState('');
  const [draftContactEmail,setDraftContactEmail]=useState('');
  const [draftInstagram,setDraftInstagram]=useState('');


  const [ready,setReady]=useState(false);
  const [startupError,setStartupError]=useState('');
  const [bootCycle,setBootCycle]=useState(0);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [registerPassword,setRegisterPassword]=useState('');
  const [draftState,setDraftState]=useState('RS');
  const [shareLocation,setShareLocation]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [detailOrigin,setDetailOrigin]=useState<Screen>('home');
  const [viewer,setViewer]=useState<{photos:Photo[];index:number}|null>(null);
  const [draftPhotos,setDraftPhotos]=useState<Photo[]>([]);
  const draftId=useRef(Crypto.randomUUID());
  const showError=(error:unknown)=>Dialog.alert('Não foi possível concluir',error instanceof Error?error.message:'Tente novamente.');
  const perform=async(operation:()=>Promise<void>)=>{if(busyRef.current)return;busyRef.current=true;setBusy(true);try{await operation();}catch(error){showError(error);}finally{busyRef.current=false;setBusy(false);}};
  const clearDraft=()=>{draftId.current=Crypto.randomUUID();setDraftTitle('');setDraftDescription('');setDraftCity('');setDraftPhone(profileRef.current?.phone||'');setDraftContactEmail(profileRef.current?.contactEmail||'');setDraftInstagram(profileRef.current?.instagramUrl||'');setDraftState('RS');setDraftCategory('Roupas');setDraftPhotos([]);setShareLocation(false);setEditingId(null);};
  const setProfile=(profile:Profile)=>{profileRef.current=profile;setLoggedProfile(profile);setLoggedId(profile.id);setDisplayName(profile.name);setEmail(profile.email);setAccountType(profile.type);setPassword('');setRegisterPassword('');};
  const clearSession=()=>{sessionVersion.current++;profileRef.current=null;setLoggedProfile(null);setLoggedId('');setDisplayName('');setPassword('');setRegisterPassword('');setSelected(null);setSearch('');setCategory('Todos');setMaxDistance(null);setGps(null);setGpsStatus('demo');clearDraft();setScreen('login');};
  const refreshFeed=async()=>{if(isOnline&&loggedId){const version=sessionVersion.current;const next=await listOnline(loggedId);if(version!==sessionVersion.current||profileRef.current?.id!==loggedId)return;setItems(next);if(selected){const current=next.find(x=>x.id===selected.id);setSelected(current||null);if(!current&&screen==='detail')setScreen('home');}}};
  useEffect(()=>{
    let active=true;const version=sessionVersion.current;setReady(false);setStartupError('');
    (async()=>{
      try{
        if(isOnline){const {data,error}=await client().auth.getSession();if(error)throw error;
          if(data.session){const verified=await client().auth.getUser();if(verified.error)throw verified.error;const profile=await profileFor(verified.data.user.id,verified.data.user.email||'');const next=await listOnline(profile.id);if(active&&version===sessionVersion.current){setProfile(profile);clearDraft();setItems(next);setScreen(profile.phone?'home':'account');}}
          else if(active)setItems([]);
        }else{const local=await readDemo();if(active)setItems([...local,...seed]);}
      }catch(error){if(active)setStartupError(error instanceof Error?error.message:'Não foi possível carregar os dados.');}
      finally{if(active)setReady(true);}
    })();
    const auth=supabase?.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'&&active){clearSession();setItems([]);}});
    return ()=>{active=false;auth?.data.subscription.unsubscribe();};
  },[bootCycle]);
  useEffect(()=>{if(!isOnline||!loggedId)return;const sub=AppState.addEventListener('change',state=>{if(state==='active'&&!busyRef.current)void perform(refreshFeed);});return ()=>sub.remove();},[loggedId,selected?.id,screen]);
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(busyRef.current)return true;if(screen==='register'){setScreen('login');return true;}if(screen==='detail'){setScreen(detailOrigin);return true;}if(screen==='account'){if(loggedProfile?.phone)setScreen('profile');return true;}if(screen==='new'||screen==='profile'){setScreen('home');return true;}return false;});return ()=>sub.remove();},[screen,detailOrigin,loggedProfile?.phone]);

  const position = gps || (isOnline?null:demoPosition);
  const visible = useMemo(()=>items.filter(x=>x.status==='disponivel').map(x=>({item:x,km:position&&x.lat!==undefined&&x.lon!==undefined?distance(position,{lat:x.lat,lon:x.lon}):undefined}))
    .filter(({item,km})=>(category==='Todos'||item.category===category)&&(!maxDistance||km!==undefined&&km<=maxDistance)&&normalizeSearch(`${item.title} ${item.category} ${item.description} ${item.city}`).includes(normalizeSearch(search)))
    .sort((a,b)=>(a.km??Infinity)-(b.km??Infinity)),[items,category,maxDistance,search,position?.lat,position?.lon]);
  const mine=items.filter(x=>x.ownerId===loggedId);

  const enter=()=>perform(async()=>{
    const address=email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw new Error('Informe um e-mail válido.');
    if(isOnline){if(!password)throw new Error('Informe sua senha.');const {data,error}=await client().auth.signInWithPassword({email:address,password});if(error)throw error;if(!data.user)throw new Error('Confira seu e-mail e sua senha.');const profile=await profileFor(data.user.id,address);const next=await listOnline(profile.id);setProfile(profile);setItems(next);}
    else setProfile({id:'demo:'+address,name:address===DEMO_EMAIL?DEMO_NAME:address.split('@')[0].replace(/[._-]/g,' '),email:address,type:'Pessoa física'});
    clearDraft();setScreen('home');
  });
  const createAccount=()=>perform(async()=>{
    const address=registerEmail.trim().toLowerCase(),name=registerName.trim();if(name.length<2||name.length>80||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))throw new Error('Informe seu nome e um e-mail válido.');
    if(isOnline){
      if(registerPassword.length<8)throw new Error('Crie uma senha com pelo menos 8 caracteres.');
      const {data,error}=await client().auth.signUp({email:address,password:registerPassword,options:{data:{display_name:name,account_type:accountType}}});if(error)throw error;setRegisterPassword('');
      if(!data.session){setEmail(address);setScreen('login');Dialog.alert('Confirme seu e-mail','Abra o e-mail de confirmação e depois entre no aplicativo.');return;}
      const profile=await profileFor(data.session.user.id,address);const next=await listOnline(profile.id);setProfile(profile);setItems(next);
    }else setProfile({id:'demo:'+address,name,email:address,type:accountType});
    clearDraft();setScreen('home');
  });
  const logout=()=>perform(async()=>{if(isOnline){const {error}=await client().auth.signOut({scope:'local'});if(error)throw error;}clearSession();});
  const requestGPS=()=>perform(async()=>{
    const permission=await Location.requestForegroundPermissionsAsync();
    if(permission.status!=='granted'){setGpsStatus('denied');Dialog.alert('Localização não autorizada','Você pode continuar pesquisando por cidade, sem GPS.');return;}
    const place=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});setGps({lat:place.coords.latitude,lon:place.coords.longitude});setGpsStatus('real');
    Dialog.alert('Localização ativada','As distâncias agora usam seu GPS. Incluir uma localização aproximada no anúncio é opcional.');
  });
  const pickPhoto=()=>perform(async()=>{
    const remaining=MAX_PHOTOS-draftPhotos.length;if(remaining<=0)throw new Error('O limite é de 6 fotos. Remova uma para adicionar outra.');
    const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:false,allowsMultipleSelection:true,selectionLimit:remaining,quality:1});
    if(result.canceled)return;const added:Photo[]=[];
    for(const asset of result.assets.slice(0,remaining)){
      const fingerprint=asset.assetId||`${asset.fileName||asset.uri}:${asset.fileSize||''}`;
      if([...draftPhotos,...added].some(p=>p.fingerprint===fingerprint))continue;
      if(asset.fileSize&&asset.fileSize>12*1024*1024)throw new Error('Uma das fotos tem mais de 12 MB. Escolha um arquivo menor.');
      const largest=Math.max(asset.width,asset.height);const actions=largest>1600?[{resize:asset.width>=asset.height?{width:1600}:{height:1600}}]:[];
      const photo=await ImageManipulator.manipulateAsync(asset.uri,actions,{compress:.8,format:ImageManipulator.SaveFormat.JPEG});
      added.push({id:Crypto.randomUUID(),uri:photo.uri,fingerprint});
    }
    if(!added.length)throw new Error('As fotos selecionadas já foram adicionadas.');
    setDraftPhotos(curr=>[...curr,...added].slice(0,MAX_PHOTOS));
  });
  const publish=()=>perform(async()=>{
    if(!loggedId)throw new Error('Entre na sua conta para publicar.');
    const previous=items.find(x=>x.id===editingId);if(editingId&&previous?.ownerId!==loggedId)throw new Error('Você só pode editar seus anúncios.');
    if(shareLocation&&!gps&&previous?.lat===undefined)throw new Error('Ative o GPS antes de incluir a localização aproximada.');
    const location=shareLocation?(gps?{lat:Number(gps.lat.toFixed(2)),lon:Number(gps.lon.toFixed(2))}:{lat:previous?.lat,lon:previous?.lon}):{};
    let newItem:Item={id:editingId||draftId.current,title:draftTitle.trim(),category:draftCategory,description:draftDescription.trim(),city:draftCity.trim(),state:draftState,photos:draftPhotos,image:draftPhotos[0]?.uri||'',phone:normalizePhone(draftPhone),contactEmail:normalizeContactEmail(draftContactEmail),instagramUrl:normalizeInstagram(draftInstagram),owner:displayName,ownerId:loggedId,status:previous?.status||'disponivel',date:previous?.date||new Date().toLocaleDateString('pt-BR'),...location};
    validateItem(newItem);let warning:string|undefined;
    if(isOnline){const result=await saveOnline(newItem,previous);newItem=result.item;warning=result.warning;}
    else{
      newItem=await persistDemoPhotos(newItem);const next=[newItem,...items.filter(x=>x.id!==newItem.id)];
      try{await writeDemo(next);}catch(error){await cleanupDemoPhotos(newItem,previous);throw error;}
      if(previous)await cleanupDemoPhotos(previous,newItem);
    }
    setItems(curr=>[newItem,...curr.filter(x=>x.id!==newItem.id)]);setSelected(newItem);setDetailOrigin('profile');clearDraft();setScreen('detail');
    Dialog.alert(editingId?'Anúncio atualizado':'Anúncio publicado',warning||(isOnline?'Seus dados e fotos foram salvos.':'Salvo neste dispositivo. A demonstração não sincroniza entre aparelhos.'));
  });
  const editSelected=()=>perform(async()=>{
    if(!selected||selected.ownerId!==loggedId)return;const contacts=isOnline?await getContacts(selected.id):{phone:selected.phone||'',email:selected.contactEmail||'',instagramUrl:selected.instagramUrl||''};
    setEditingId(selected.id);setDraftTitle(selected.title);setDraftDescription(selected.description);setDraftCategory(selected.category);setDraftCity(selected.city);setDraftState(selected.state);setDraftPhone(contacts.phone);setDraftContactEmail(contacts.email||'');setDraftInstagram(contacts.instagramUrl||'');setDraftPhotos(itemPhotos(selected));setShareLocation(selected.lat!==undefined);setScreen('new');
  });
  const updateStatus=(item:Item)=>{
    if(item.ownerId!==loggedId)return;
    Dialog.alert(item.status==='doado'?'Reativar anúncio?':'Marcar como doado?',item.status==='doado'?'Ele voltará a aparecer na busca.':'Ele deixará de aparecer na busca.',[
      {text:'Cancelar',style:'cancel'},{text:'Confirmar',onPress:()=>void perform(async()=>{
        const changed=isOnline?await statusOnline(item):{...item,status:item.status==='doado'?'disponivel' as const:'doado' as const};
        const next=items.map(x=>x.id===item.id?changed:x);if(!isOnline)await writeDemo(next);setItems(next);setSelected(changed);setScreen('profile');
      })}
    ]);
  };
  const deleteItem=(item:Item)=>{if(item.ownerId!==loggedId)return;Dialog.alert('Excluir anúncio?','As fotos e o anúncio serão removidos.',[
    {text:'Cancelar',style:'cancel'},{text:'Excluir',style:'destructive',onPress:()=>void perform(async()=>{
      let warning:string|undefined;if(isOnline)warning=await deleteOnline(item);
      else{await writeDemo(items.filter(x=>x.id!==item.id));await cleanupDemoPhotos(item);}
      setItems(curr=>curr.filter(x=>x.id!==item.id));setSelected(null);if(editingId===item.id)clearDraft();setScreen('profile');if(warning)Dialog.alert('Anúncio excluído',warning);
    })}
  ]);};

  const ProductPhoto=({item,large=false}:{item:Item;large?:boolean})=>item.image?<Image source={{uri:item.image}} style={large?s.detailImage:s.productImage} resizeMode="contain"/>:
    <Image source={categoryIllustrations[item.category]} style={large?s.detailImage:s.productImage} resizeMode="contain"/>;
  const ProductCard=({item,km}:{item:Item;km?:number})=><Pressable style={s.productCard} onPress={()=>{setSelected(item);setDetailOrigin('home');setScreen('detail');}}>
    <ProductPhoto item={item}/><View style={s.cardContent}><Text style={s.cardCategory}>{item.category.toUpperCase()}</Text><Text numberOfLines={2} style={s.cardTitle}>{item.title}</Text>
    <View style={s.miniRow}><Symbol name="location-outline" size={13} color={C.muted}/><Text numberOfLines={1} style={s.cardPlace}>{item.city}</Text></View>
    <View style={s.cardFoot}><Text style={s.distanceText}>{formatDistance(km)}</Text><Symbol name="arrow-forward-circle" size={23} color={C.blue}/></View></View>
  </Pressable>;
  const Nav=()=> <View style={s.nav}>
    {([['home','home-outline','Explorar'],['new','add-circle-outline','Doar'],['profile','person-outline','Perfil']] as const).map(([target,icon,label])=><Pressable key={target} style={s.navItem} onPress={()=>setScreen(target)}><Symbol name={icon} size={25} color={screen===target?C.blue:C.muted}/><Text style={[s.navLabel,screen===target&&{color:C.blue,fontWeight:'700'}]}>{label}</Text></Pressable>)}
  </View>;
  const Top=({title,back=false,subtitle}:{title:string;back?:boolean;subtitle?:string})=><View style={s.top}><Pressable onPress={back?()=>setScreen(screen==='register'?'login':screen==='detail'?detailOrigin:'home'):undefined} disabled={!back} style={s.topSide}><Symbol name={back?'arrow-back':'heart-outline'} size={24} color={C.blue}/></Pressable>
    <View style={{flex:1}}><Text style={s.topTitle}>{title}</Text>{subtitle&&<Text style={s.topSubtitle}>{subtitle}</Text>}</View><View style={{width:4}}/></View>;

  const authenticated=async(profile:Profile)=>{const version=sessionVersion.current;const next=await listOnline(profile.id);if(version!==sessionVersion.current)return;setProfile(profile);clearDraft();setItems(next);setScreen(profile.phone?'home':'account');};

  if(!ready||startupError)return <SafeAreaView style={[s.safe,{justifyContent:'center',padding:24}]}>{!ready?<ActivityIndicator size="large" color={C.blue}/>:<><Text style={s.sectionTitle}>Não foi possível carregar</Text><Text style={[s.paragraph,{marginVertical:15}]}>{startupError}</Text><Button label="Tentar novamente" onPress={()=>setBootCycle(x=>x+1)}/></>}</SafeAreaView>;
  if(isOnline&&!loggedId)return <AuthScreen onSignedIn={authenticated}/>;
  if(isOnline&&screen==='account'&&loggedProfile)return <ProfileEditor profile={loggedProfile} onBusyChange={value=>{busyRef.current=value;setBusy(value);}} onSaved={profile=>{setProfile(profile);clearDraft();setItems(items=>items.map(item=>item.ownerId===profile.id?{...item,owner:profile.name}:item));setScreen('profile');}} onBack={()=>setScreen('profile')} onLogout={logout}/>;
  return <SafeAreaView style={s.safe}><StatusBar barStyle="dark-content" backgroundColor={C.pale}/>
    {screen==='login' && <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}><ScrollView contentContainerStyle={s.authContent} keyboardShouldPersistTaps="handled">
      <View style={s.authLogo}><Symbol name="heart" size={39} color={C.white}/></View><Text style={s.brand}>Conecta<Text style={{color:C.blue}}>Solidário</Text></Text>
      <Text style={s.authHeading}>Conectando quem doa a quem precisa.</Text><Text style={s.authLead}>Encontre doações por perto ou compartilhe algo que pode transformar o dia de alguém.</Text>
      <View style={s.authPanel}><Text style={s.authPanelTitle}>Bem-vindo de volta</Text><Text style={s.authPanelSub}>Entre para continuar</Text>
        <Field label={isOnline?'E-mail':'Chave de demonstração'} value={email} onChange={setEmail} placeholder={isOnline?'seuemail@exemplo.com':DEMO_EMAIL} keyboardType="email-address" icon="mail-outline"/>
        {isOnline&&<Field label="Senha" value={password} onChange={setPassword} placeholder="Sua senha" secure icon="lock-closed-outline"/>}
        <Button label={isOnline?'Entrar':'Entrar na demonstração'} onPress={enter} icon="arrow-forward"/><Pressable onPress={()=>setScreen('register')} style={{paddingVertical:18,alignItems:'center'}}><Text style={s.smallText}>Não tem uma conta? <Text style={{color:C.blue,fontWeight:'700'}}>Cadastre-se</Text></Text></Pressable>
      </View><Text style={s.demoNote}>{isOnline?'Entre com sua conta para sincronizar anúncios e fotos.':'Acesso pronto: demo@conectasolidario.test. Sem senha e sem e-mail real.'}</Text>
    </ScrollView></KeyboardAvoidingView>}
    {screen==='register' && <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}><ScrollView contentContainerStyle={{padding:24,paddingTop:20}} keyboardShouldPersistTaps="handled">
      <Top title="Criar conta" back/><Text style={[s.sectionTitle,{marginTop:30}]}>Todo mundo pode ajudar <Text style={{color:C.blue}}>♡</Text></Text><Text style={s.paragraph}>Pessoas e ONGs podem doar e buscar produtos, sem nenhuma cobrança.</Text>
      <View style={s.authPanel}><Field label="Nome ou nome da ONG" value={registerName} onChange={setRegisterName} placeholder="Seu nome" icon="person-outline"/>
        <Field label="E-mail" value={registerEmail} onChange={setRegisterEmail} placeholder="seuemail@exemplo.com" keyboardType="email-address" icon="mail-outline"/>
        {isOnline&&<Field label="Senha" value={registerPassword} onChange={setRegisterPassword} placeholder="Pelo menos 8 caracteres" secure icon="lock-closed-outline"/>}<Text style={s.label}>Tipo de conta</Text><View style={s.choiceRow}>{(['Pessoa física','ONG'] as const).map(t=><Pressable key={t} onPress={()=>setAccountType(t)} style={[s.choice,accountType===t&&s.choiceSelected]}><Text style={{color:accountType===t?C.blue:C.muted,fontWeight:'700'}}>{t}</Text></Pressable>)}</View>
        <Button label="Começar a usar" onPress={createAccount} icon="arrow-forward"/>
      </View><Text style={s.demoNote}>{isOnline?'Confirme seu e-mail para ativar a conta.':'Perfil de demonstração. Nenhuma conta online será criada.'}</Text>
    </ScrollView></KeyboardAvoidingView>}
    {screen==='home' && <><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:18}} keyboardShouldPersistTaps="handled">
      <Top title={`Olá, ${shortName(displayName)}! 👋`} subtitle="Que bom ter você aqui"/>
      <View style={s.pagePad}>
        <View style={s.hero}><View style={{flex:1}}><Text style={s.heroEyebrow}>CONECTANDO PESSOAS</Text><Text style={s.heroTitle}>Uma doação pode mudar tudo.</Text><Text style={s.heroText}>Tem algo parado em casa? Faça o bem!</Text><Pressable onPress={()=>setScreen('new')} style={s.heroButton}><Symbol name="add" size={19} color={C.blue}/><Text style={{color:C.blue,fontWeight:'800'}}>Quero doar</Text></Pressable></View><View style={s.heroHeart}><Symbol name="heart" size={55} color="#83C2FB"/></View></View>
        <Text style={s.sectionTitle}>Encontre o que precisa</Text>
        <SearchBar value={search} onChange={setSearch}/>
        <View style={s.locationPanel}><View style={[s.miniRow,{flex:1}]}><Symbol name="location" color={C.blue} size={18}/><View style={{flex:1}}><Text style={{fontSize:13,fontWeight:'700',color:C.navy}}>{gpsStatus==='real'?'Próximo de você':isOnline?'Localização não ativada':'Referência: Caxias do Sul, RS'}</Text><Text style={{fontSize:11,color:C.muted}}>{gpsStatus==='real'?'Localização atual autorizada':isOnline?'Busque por produto ou cidade':'Distâncias a partir de Caxias do Sul'}</Text></View></View><Pressable onPress={requestGPS} style={s.gpsButton}><Text style={{fontSize:12,color:C.blue,fontWeight:'800'}}>Usar GPS</Text></Pressable></View>
        <View style={s.sectionHead}><Text style={s.sectionTitle}>Categorias</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:19,gap:9,paddingBottom:7}}>{categories.map(x=><Pressable key={x} onPress={()=>setCategory(x)} style={[s.chip,category===x&&s.chipActive]}><Symbol name={icons[x]} color={category===x?C.white:C.blue} size={17}/><Text style={[s.chipText,category===x&&{color:C.white}]}>{x}</Text></Pressable>)}</ScrollView>
      <View style={s.pagePad}><View style={s.sectionHead}><View><Text style={s.sectionTitle}>Doações disponíveis</Text><Text style={s.sectionSub}>{visible.length} anúncio(s) encontrado(s)</Text></View>{isOnline&&<Pressable accessibilityRole="button" onPress={()=>void perform(refreshFeed)} style={{padding:10}}><Text style={{color:C.blue,fontWeight:'800'}}>Atualizar</Text></Pressable>}</View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:16}}>{([['Qualquer distância',null],['Até 5 km',5],['Até 20 km',20],['Até 50 km',50]] as [string,number|null][]).map(([label,value])=><Pressable key={label} onPress={()=>{if(value&&isOnline&&!gps){Dialog.alert('Ative a localização','Toque em Usar GPS para filtrar pela distância. A busca por cidade funciona sem GPS.');return;}setMaxDistance(value);}} style={[s.filter,maxDistance===value&&s.filterActive]}><Text style={[s.filterText,maxDistance===value&&{color:C.blue,fontWeight:'800'}]}>{label}</Text></Pressable>)}</ScrollView>
        <View style={s.cards}>{visible.map(({item,km})=><ProductCard key={item.id} item={item} km={km}/>)}</View>
        {visible.length===0&&<View style={s.empty}><Symbol name="search-outline" size={42} color={C.muted}/><Text style={s.emptyTitle}>Nenhum item encontrado</Text><Text style={s.paragraph}>Experimente outra categoria, termo ou distância.</Text><Pressable onPress={()=>{setSearch('');setCategory('Todos');setMaxDistance(null)}}><Text style={{color:C.blue,fontWeight:'800',marginTop:10}}>Limpar filtros</Text></Pressable></View>}
      </View>
    </ScrollView><Nav/></>}
    {screen==='detail' && selected && <><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:20}}><Top title="Detalhes da doação" back/>
      <View style={{marginHorizontal:19,marginTop:6}}><PhotoGallery photos={itemPhotos(selected)} placeholder={categoryIllustrations[selected.category]} onOpen={index=>setViewer({photos:itemPhotos(selected),index})}/></View>
      <View style={s.pagePad}><View style={s.detailTag}><Text style={{color:C.green,fontWeight:'800',fontSize:12}}>● {selected.status==='disponivel'?'DISPONÍVEL':'DOADO'}</Text></View><Text style={s.detailTitle}>{selected.title}</Text><Text style={{color:C.blue,fontWeight:'700',marginTop:4}}>{selected.category}</Text>
        <View style={[s.detailInfo,{marginTop:22}]}><Symbol name="location-outline" color={C.blue} size={21}/><View><Text style={s.detailLabel}>Localização aproximada</Text><Text style={s.detailValue}>{selected.city} / {selected.state}</Text></View></View>
        <View style={s.detailInfo}><Symbol name="navigate-outline" color={C.blue} size={21}/><View><Text style={s.detailLabel}>Distância estimada</Text><Text style={s.detailValue}>{position&&selected.lat!==undefined&&selected.lon!==undefined?formatDistance(distance(position,{lat:selected.lat,lon:selected.lon})):'Não informada'}</Text></View></View>
        <Text style={[s.sectionTitle,{marginTop:25,marginBottom:9}]}>Sobre a doação</Text><Text style={s.paragraph}>{selected.description}</Text>
        <View style={s.ownerPanel}><View style={s.avatarSmall}><Symbol name="person" size={23} color={C.blue}/></View><View style={{flex:1}}><Text style={s.detailLabel}>Publicado por</Text><Text style={s.detailValue}>{selected.owner}</Text></View><Text style={{fontSize:12,color:C.muted}}>{selected.date}</Text></View>
        <ContactsCard key={selected.id} item={selected} isOwner={selected.ownerId===loggedId}/><Text style={s.safetyText}><Symbol name="shield-checkmark-outline" size={15} color={C.green}/> Combine a entrega em local seguro. Não compartilhe dados sensíveis.</Text>
        {selected.ownerId===loggedId&&<View style={{gap:10,marginTop:18}}><Button label="Editar anúncio e fotos" onPress={editSelected} secondary/><Button label={selected.status==='doado'?'Reativar anúncio':'Marcar como doado'} onPress={()=>updateStatus(selected)} secondary/><Button label="Excluir meu anúncio" onPress={()=>deleteItem(selected)} secondary/></View>}
      </View>
    </ScrollView></>}
    {screen==='new' && <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}><ScrollView contentContainerStyle={{paddingBottom:40}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}><Top title={editingId?'Editar doação':'Anunciar doação'} subtitle="Compartilhe o que você tem"/>
      <View style={s.pagePad}><Text style={[s.sectionTitle,{marginTop:9}]}>Vamos fazer o bem juntos!</Text><Text style={[s.paragraph,{marginBottom:20}]}>Conte sobre o produto e informe seus contatos. WhatsApp é obrigatório; e-mail e Instagram são opcionais.</Text>
        <PhotoGallery photos={draftPhotos} onAdd={pickPhoto} onRemove={id=>setDraftPhotos(curr=>curr.filter(p=>p.id!==id))} onCover={id=>setDraftPhotos(curr=>[...curr.filter(p=>p.id===id),...curr.filter(p=>p.id!==id)])} onOpen={index=>setViewer({photos:draftPhotos,index})}/>
        <Field label="Nome do produto *" value={draftTitle} onChange={setDraftTitle} placeholder="Ex.: Mesa de escritório"/>
        <Text style={s.label}>Categoria *</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,marginBottom:17}}>{categories.filter(x=>x!=='Todos').map(x=><Pressable key={x} onPress={()=>setDraftCategory(x as Exclude<Category,'Todos'>)} style={[s.filter,draftCategory===x&&s.filterActive]}><Text style={[s.filterText,draftCategory===x&&{color:C.blue,fontWeight:'800'}]}>{x}</Text></Pressable>)}</ScrollView>
        <Field label="Descrição *" value={draftDescription} onChange={setDraftDescription} multiline placeholder="Condição do item, detalhes e observações para retirada..."/>
        <Field label="Cidade *" value={draftCity} onChange={setDraftCity} placeholder="Ex.: Caxias do Sul" icon="location-outline"/>
        <Text style={s.label}>UF *</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{gap:8,paddingBottom:14}}>{STATES.map(uf=><Pressable key={uf} onPress={()=>setDraftState(uf)} style={[s.filter,draftState===uf&&s.filterActive]}><Text style={s.filterText}>{uf}</Text></Pressable>)}</ScrollView>
        <Text style={[s.sectionTitle,{marginTop:6,marginBottom:8}]}>Como entrar em contato</Text><Text style={[s.paragraph,{fontSize:12,marginBottom:16}]}>Estes contatos ficam visíveis nos detalhes da doação.</Text>
        <Field label="WhatsApp com DDD *" value={draftPhone} onChange={setDraftPhone} placeholder="(54) 99999-9999" keyboardType="phone-pad" icon="logo-whatsapp"/>
        <Field label="E-mail para contato (opcional)" value={draftContactEmail} onChange={setDraftContactEmail} placeholder="contato@exemplo.com" keyboardType="email-address" icon="mail-outline" maxLength={254}/>
        <Field label="Instagram (opcional)" value={draftInstagram} onChange={setDraftInstagram} placeholder="@seu.usuario ou link do perfil" icon="logo-instagram" maxLength={500}/>
        <View style={s.noteBox}><Symbol name="information-circle-outline" color={C.blue} size={21}/><Text style={{color:C.muted,flex:1,lineHeight:19,fontSize:12}}>O WhatsApp e o e-mail poderão ser copiados. O Instagram abrirá o perfil informado. Confira os contatos antes de publicar.</Text></View>
        <Pressable accessibilityRole="checkbox" accessibilityState={{checked:shareLocation}} onPress={()=>setShareLocation(x=>!x)} style={[s.noteBox,{marginBottom:5}]}><Symbol name={shareLocation?'checkbox':'square-outline'} color={C.blue}/><Text style={{flex:1,color:C.navy,fontSize:13,lineHeight:20}}>Incluir localização aproximada para calcular distâncias. O endereço exato não é publicado.</Text></Pressable>
        <Pressable onPress={requestGPS} style={{padding:12}}><Text style={{color:C.blue,fontWeight:'700'}}>{gps?'✓ GPS ativado':'Ativar GPS (opcional)'}</Text></Pressable>
        <Button label={editingId?'Salvar alterações':'Publicar doação'} icon="checkmark-circle-outline" onPress={publish}/>
        {editingId&&<Pressable style={{padding:17,alignItems:'center'}} onPress={()=>{clearDraft();setScreen('detail');}}><Text style={{color:C.blue}}>Cancelar edição</Text></Pressable>}
      </View></ScrollView><Nav/></KeyboardAvoidingView>}
    {screen==='profile' && <><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom:25}}><Top title="Meu perfil" subtitle="Suas doações em um só lugar"/>
      <View style={s.pagePad}><View style={s.profilePanel}><View style={s.avatarLarge}><Text style={{fontSize:35,color:C.blue,fontWeight:'800'}}>{(displayName[0]||'V').toUpperCase()}</Text></View><Text style={s.profileName}>{displayName||'Visitante'}</Text><Text style={s.paragraph}>{email||'Conta de demonstração'}</Text><View style={s.demoTag}><Text style={{color:C.blue,fontWeight:'700',fontSize:11}}>{isOnline?accountType.toUpperCase():'PERFIL DE DEMONSTRAÇÃO'}</Text></View></View>
        {isOnline&&<Button label="Editar meu cadastro" onPress={()=>setScreen('account')} secondary/>}
        <View style={s.stats}><View style={s.stat}><Text style={s.statNum}>{mine.length}</Text><Text style={s.statLabel}>Anúncios</Text></View><View style={s.statSep}/><View style={s.stat}><Text style={s.statNum}>{mine.filter(x=>x.status==='disponivel').length}</Text><Text style={s.statLabel}>Disponíveis</Text></View><View style={s.statSep}/><View style={s.stat}><Text style={s.statNum}>{mine.filter(x=>x.status==='doado').length}</Text><Text style={s.statLabel}>Doados</Text></View></View>
        <View style={s.sectionHead}><Text style={s.sectionTitle}>Meus anúncios</Text><Pressable onPress={()=>setScreen('new')}><Text style={{color:C.blue,fontWeight:'800'}}>+ Novo</Text></Pressable></View>
        {mine.length===0?<View style={s.empty}><Symbol name="gift-outline" color={C.blue} size={45}/><Text style={s.emptyTitle}>Sua primeira doação começa aqui</Text><Text style={s.paragraph}>Publique um item e ajude alguém!</Text><View style={{marginTop:18,width:'100%'}}><Button label="Cadastrar produto" onPress={()=>setScreen('new')}/></View></View>:
        mine.map(item=><Pressable key={item.id} onPress={()=>{setSelected(item);setDetailOrigin('profile');setScreen('detail')}} style={s.myItem}><Image source={item.image?{uri:item.image}:categoryIllustrations[item.category]} style={s.myThumb}/><View style={{flex:1}}><Text style={s.cardTitle}>{item.title}</Text><Text style={s.cardPlace}>{item.category} • {item.city}</Text><Text style={{fontSize:12,color:item.status==='disponivel'?C.green:C.muted,fontWeight:'800',marginTop:4}}>{item.status==='disponivel'?'Disponível':'Doado'}</Text></View><Symbol name="chevron-forward" color={C.muted}/></Pressable>)}
        <Pressable style={s.exit} onPress={logout}><Symbol name="log-out-outline" color={C.muted}/><Text style={{color:C.muted,fontWeight:'700'}}>{isOnline?'Sair da conta':'Sair da demonstração'}</Text></Pressable>
      </View></ScrollView><Nav/></>}
    <PhotoViewer value={viewer} onClose={()=>setViewer(null)}/>
    {busy&&<View accessibilityLiveRegion="polite" style={s.busyOverlay}><ActivityIndicator size="large" color={C.blue}/><Text style={{color:C.navy,marginTop:12,fontWeight:'700'}}>Aguarde…</Text></View>}
  </SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.pale},pagePad:{paddingHorizontal:19},
 photoFrame:{height:230,width:'100%',borderWidth:1,borderColor:'#C7DDEB',borderRadius:18,overflow:'hidden',backgroundColor:'#EAF3FB',alignItems:'center',justifyContent:'center',padding:8},
 fullPhoto:{width:'100%',height:'100%'},photoHint:{position:'absolute',right:10,bottom:10,backgroundColor:'#193858DD',color:'white',padding:7,borderRadius:8,fontSize:11},
 galleryBar:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:10},addPhotos:{backgroundColor:C.sky,padding:12,borderRadius:11},photoCaption:{color:C.muted,fontSize:11,lineHeight:18},
 photoThumb:{width:76,height:65,padding:3,borderRadius:10,borderWidth:2,borderColor:'transparent',backgroundColor:C.sky},removePhoto:{paddingVertical:9,backgroundColor:'#FFF1F1',alignItems:'center',borderRadius:7,marginTop:4},
 viewerBar:{flexDirection:'row',alignItems:'center',padding:15},viewerButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',backgroundColor:'#263D57',borderRadius:10,paddingHorizontal:8},
 busyOverlay:{position:'absolute',top:0,bottom:0,left:0,right:0,backgroundColor:'#F5F9FDEA',alignItems:'center',justifyContent:'center',zIndex:20},
 top:{paddingHorizontal:19,paddingTop:12,paddingBottom:15,flexDirection:'row',alignItems:'center',gap:12},
 topSide:{height:43,width:43,borderRadius:15,backgroundColor:C.white,alignItems:'center',justifyContent:'center'},
 topTitle:{color:C.navy,fontSize:19,fontWeight:'800'},topSubtitle:{color:C.muted,fontSize:12,marginTop:2},
 brand:{fontSize:28,fontWeight:'900',color:C.navy,marginTop:15,letterSpacing:-1.2},
 authContent:{flexGrow:1,alignItems:'center',paddingHorizontal:23,paddingTop:38,paddingBottom:20},
 authLogo:{width:75,height:75,borderRadius:24,backgroundColor:C.blue,alignItems:'center',justifyContent:'center'},
 authHeading:{fontSize:27,color:C.navy,fontWeight:'900',textAlign:'center',marginTop:26,lineHeight:33},
 authLead:{fontSize:14,color:C.muted,textAlign:'center',lineHeight:22,marginTop:9,marginBottom:25},
 authPanel:{width:'100%',backgroundColor:C.white,borderRadius:24,padding:21,borderWidth:1,borderColor:C.line},
 authPanelTitle:{fontSize:21,fontWeight:'800',color:C.navy},authPanelSub:{fontSize:13,color:C.muted,marginBottom:22,marginTop:4},
 label:{fontSize:13,color:C.navy,fontWeight:'800',marginBottom:9},
 inputWrap:{borderWidth:1,borderColor:C.line,borderRadius:13,minHeight:51,backgroundColor:'#FAFCFF',flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:14},
 input:{flex:1,minWidth:0,fontSize:16,color:C.dark,minHeight:48,paddingHorizontal:0,paddingVertical:12,lineHeight:24,includeFontPadding:false,borderWidth:0,backgroundColor:'transparent',...(Platform.OS==='web'?{outlineStyle:'solid' as const,outlineWidth:0}:{})},
 inputFocus:{borderColor:C.blue,...(Platform.OS==='web'?{boxShadow:'0 0 0 3px rgba(35,118,201,0.16)'}:{})},
 button:{borderRadius:14,minHeight:52,backgroundColor:C.blue,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:9,paddingHorizontal:17,marginTop:5},
 buttonAlt:{backgroundColor:C.sky,borderWidth:1,borderColor:'#C8E3FD'},buttonText:{color:C.white,fontSize:15,fontWeight:'800'},
 smallText:{color:C.muted,fontSize:13},demoNote:{color:C.muted,fontSize:11,textAlign:'center',marginTop:22,lineHeight:18},
 choiceRow:{flexDirection:'row',gap:10,marginBottom:19},choice:{flex:1,borderRadius:12,borderWidth:1,borderColor:C.line,paddingVertical:14,alignItems:'center'},choiceSelected:{borderColor:C.blue,backgroundColor:C.sky},
 hero:{backgroundColor:'#DDEFFF',borderRadius:23,padding:19,marginTop:6,marginBottom:26,minHeight:165,flexDirection:'row',alignItems:'center',overflow:'hidden'},
 heroEyebrow:{fontSize:9,color:C.blue,fontWeight:'900',letterSpacing:1.3},heroTitle:{color:C.navy,fontSize:22,fontWeight:'900',lineHeight:28,marginTop:8,maxWidth:215},heroText:{color:'#52718F',fontSize:12,marginTop:8},
 heroButton:{flexDirection:'row',gap:5,alignItems:'center',backgroundColor:C.white,borderRadius:12,alignSelf:'flex-start',marginTop:14,paddingHorizontal:12,paddingVertical:10},
 heroHeart:{width:92,height:92,backgroundColor:'#C7E4FF',borderRadius:30,alignItems:'center',justifyContent:'center',transform:[{rotate:'-12deg'}]},
 sectionTitle:{fontSize:19,color:C.navy,fontWeight:'900',letterSpacing:-.4},sectionHead:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:18,marginBottom:13},sectionSub:{color:C.muted,fontSize:12,marginTop:3},
 searchBar:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:C.white,borderRadius:14,borderWidth:1,borderColor:C.line,paddingHorizontal:14,minHeight:54,marginTop:12},
 locationPanel:{backgroundColor:'#EDF5FE',padding:12,borderRadius:14,marginTop:11,flexDirection:'row',alignItems:'center',gap:8},gpsButton:{backgroundColor:C.white,paddingVertical:10,paddingHorizontal:11,borderRadius:10},miniRow:{flexDirection:'row',alignItems:'center',gap:5},
 chip:{backgroundColor:C.white,borderColor:C.line,borderWidth:1,borderRadius:14,flexDirection:'row',gap:7,alignItems:'center',paddingVertical:10,paddingHorizontal:14},chipActive:{backgroundColor:C.blue,borderColor:C.blue},chipText:{fontSize:12,fontWeight:'700',color:C.navy},
 filter:{borderWidth:1,borderColor:C.line,backgroundColor:C.white,borderRadius:30,paddingHorizontal:14,paddingVertical:9},filterActive:{borderColor:'#ABCEE9',backgroundColor:C.sky},filterText:{fontSize:12,color:C.muted,fontWeight:'600'},
 cards:{flexDirection:'row',flexWrap:'wrap',gap:12,justifyContent:'space-between'},productCard:{width:'48%',backgroundColor:C.white,borderRadius:18,borderWidth:1,borderColor:C.line,overflow:'hidden',marginBottom:4},
 productImage:{width:'100%',height:132,backgroundColor:C.sky},cardContent:{padding:11},cardCategory:{fontSize:9,color:C.blue,fontWeight:'900',letterSpacing:.5},cardTitle:{color:C.navy,fontSize:14,fontWeight:'900',marginTop:5,lineHeight:19,minHeight:21},cardPlace:{fontSize:11,color:C.muted,flexShrink:1},cardFoot:{borderTopColor:C.line,borderTopWidth:1,marginTop:12,paddingTop:9,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},distanceText:{fontSize:11,color:C.blue,fontWeight:'800'},
 empty:{padding:28,alignItems:'center',backgroundColor:C.white,borderColor:C.line,borderWidth:1,borderRadius:20,marginTop:6},emptyTitle:{fontSize:17,color:C.navy,fontWeight:'800',textAlign:'center',marginTop:12},paragraph:{color:C.muted,fontSize:14,lineHeight:22},
 nav:{flexDirection:'row',borderTopWidth:1,borderColor:C.line,backgroundColor:C.white,minHeight:70,paddingBottom:Platform.OS==='ios'?10:0},navItem:{flex:1,alignItems:'center',justifyContent:'center',gap:4},navLabel:{fontSize:11,color:C.muted},
 detailImage:{width:'100%',height:260},detailTag:{backgroundColor:C.lightGreen,borderRadius:9,paddingHorizontal:12,paddingVertical:8,alignSelf:'flex-start',marginTop:21},detailTitle:{fontSize:27,color:C.navy,fontWeight:'900',marginTop:12},detailInfo:{flexDirection:'row',alignItems:'center',gap:13,paddingVertical:12,borderBottomWidth:1,borderBottomColor:C.line},detailLabel:{fontSize:11,color:C.muted,marginBottom:4},detailValue:{fontSize:14,color:C.navy,fontWeight:'800'},
 ownerPanel:{backgroundColor:C.white,marginTop:22,borderRadius:16,borderWidth:1,borderColor:C.line,padding:12,flexDirection:'row',gap:12,alignItems:'center'},avatarSmall:{width:47,height:47,borderRadius:15,backgroundColor:C.sky,alignItems:'center',justifyContent:'center'},safetyText:{fontSize:12,color:C.muted,lineHeight:19,marginTop:15},bottomAction:{backgroundColor:C.white,paddingHorizontal:19,paddingTop:10,paddingBottom:18,borderTopWidth:1,borderColor:C.line},
 uploadBox:{height:165,borderWidth:1.6,borderStyle:'dashed',borderColor:'#ACD5F7',backgroundColor:'#EAF5FF',borderRadius:20,alignItems:'center',justifyContent:'center',marginBottom:23,overflow:'hidden'},uploadIcon:{backgroundColor:C.white,borderRadius:15,padding:12},uploadTitle:{color:C.navy,fontSize:15,fontWeight:'800',marginTop:12},uploadText:{fontSize:12,color:C.muted,marginTop:4},
 noteBox:{backgroundColor:C.sky,borderRadius:14,padding:13,flexDirection:'row',gap:9,alignItems:'flex-start',marginVertical:12},
 profilePanel:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:20,padding:24,alignItems:'center',marginTop:10},avatarLarge:{width:82,height:82,borderRadius:25,backgroundColor:C.sky,alignItems:'center',justifyContent:'center'},profileName:{fontSize:22,fontWeight:'900',color:C.navy,marginTop:14},demoTag:{paddingVertical:7,paddingHorizontal:11,backgroundColor:C.sky,borderRadius:9,marginTop:12},
 stats:{borderRadius:17,backgroundColor:C.white,borderWidth:1,borderColor:C.line,paddingVertical:17,flexDirection:'row',marginTop:15},stat:{flex:1,alignItems:'center'},statSep:{width:1,backgroundColor:C.line},statNum:{color:C.blue,fontSize:22,fontWeight:'900'},statLabel:{color:C.muted,fontSize:11,marginTop:4},
 myItem:{backgroundColor:C.white,borderColor:C.line,borderWidth:1,borderRadius:15,padding:10,marginBottom:10,flexDirection:'row',alignItems:'center',gap:13},myThumb:{width:65,height:65,borderRadius:11,backgroundColor:C.sky,resizeMode:'contain'},exit:{marginTop:24,flexDirection:'row',gap:9,alignItems:'center',justifyContent:'center',padding:18},
});
