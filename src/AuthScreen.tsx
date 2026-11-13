import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,BackHandler,KeyboardAvoidingView,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Ionicons} from '@expo/vector-icons';
import {client,profileFor} from './repository';
import {normalizePhone,Profile} from './domain';
import {accountCode,accountEmail,accountError,accountName,accountPassword} from './authRules';

type Phase='login'|'register'|'verify'|'forgot'|'recovery'|'password';
const blue='#2376C9',navy='#173456';
export function AuthField({label,value,onChange,kind='text',placeholder,maxLength}:{label:string;value:string;onChange:(v:string)=>void;kind?:'text'|'email'|'phone'|'password'|'code';placeholder?:string;maxLength?:number}){
  const [visible,setVisible]=useState(false),[focused,setFocused]=useState(false);
  return <View style={{marginBottom:16}}><Text style={styles.label}>{label}</Text><View style={[styles.inputRow,focused&&styles.inputFocus]}>
    <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} underlineColorAndroid="transparent" style={styles.input} placeholder={placeholder} placeholderTextColor="#91A2B5" autoCorrect={false} autoCapitalize={kind==='text'?'words':'none'} keyboardType={kind==='email'?'email-address':kind==='phone'?'phone-pad':kind==='code'?'number-pad':'default'} secureTextEntry={kind==='password'&&!visible} maxLength={maxLength??(kind==='password'?72:kind==='code'?10:kind==='phone'?22:kind==='email'?254:80)} selectionColor={blue} cursorColor={blue} autoComplete={kind==='email'?'email':kind==='password'?'password':kind==='code'?'one-time-code':kind==='phone'?'tel':'name'}/>
    {kind==='password'&&<Pressable accessibilityRole="button" accessibilityLabel={visible?'Ocultar senha':'Mostrar senha'} onPress={()=>setVisible(x=>!x)} style={{padding:12}}><Ionicons name={visible?'eye-off-outline':'eye-outline'} size={21} color={blue}/></Pressable>}
  </View></View>;
}
export function AuthButton({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,secondary&&{backgroundColor:'#E9F4FF'},disabled&&{opacity:.55}]}><Text style={{color:secondary?blue:'white',fontWeight:'800',fontSize:15}}>{label}</Text></Pressable>;
}
export function AuthScreen({onSignedIn}:{onSignedIn:(profile:Profile)=>Promise<void>}){
  const [phase,setPhase]=useState<Phase>('login');
  const [email,setEmail]=useState(''),[name,setName]=useState(''),[phone,setPhone]=useState('');
  const [type,setType]=useState<Profile['type']>('Pessoa física');
  const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[code,setCode]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[resendAt,setResendAt]=useState(0),[now,setNow]=useState(Date.now());
  const pending=useRef(false),recoverySession=useRef(false);
  useEffect(()=>{if(!['verify','recovery'].includes(phase)||resendAt<=Date.now())return;setNow(Date.now());const timer=setInterval(()=>{const time=Date.now();setNow(time);if(time>=resendAt)clearInterval(timer);},1000);return()=>clearInterval(timer);},[phase,resendAt]);
  const remaining=Math.max(0,Math.ceil((resendAt-now)/1000));
  const change=(next:Phase)=>{setError('');setNotice('');setCode('');setPassword('');setConfirmation('');setPhase(next);};
  const perform=async(operation:()=>Promise<void>)=>{if(pending.current)return;pending.current=true;setBusy(true);setError('');setNotice('');try{await operation();}catch(e){setError(accountError(e));}finally{pending.current=false;setBusy(false);}};
  const back=()=>{if(pending.current)return;void perform(async()=>{if(recoverySession.current){const {error}=await client().auth.signOut({scope:'local'});if(error)throw error;recoverySession.current=false;}change('login');});};
  useEffect(()=>{const sub=BackHandler.addEventListener('hardwareBackPress',()=>{if(phase==='login')return pending.current;back();return true;});return()=>sub.remove();},[phase]);
  const finish=async(id:string,address:string)=>{const profile=await profileFor(id,address);await onSignedIn(profile);};
  const enter=()=>void perform(async()=>{
    const address=accountEmail(email);if(!password)throw new Error('Informe sua senha.');
    const {data,error}=await client().auth.signInWithPassword({email:address,password});
    if(error)throw error;if(!data.user||!data.session)throw new Error('Não foi possível iniciar a sessão.');
    await finish(data.user.id,address);
  });
  const register=()=>void perform(async()=>{
    const address=accountEmail(email),displayName=accountName(name),contactPhone=normalizePhone(phone);accountPassword(password,confirmation);
    const {data,error}=await client().auth.signUp({email:address,password,options:{data:{display_name:displayName,account_type:type,contact_phone:contactPhone}}});
    if(error)throw error;setEmail(address);setPassword('');setConfirmation('');
    if(data.session){await finish(data.session.user.id,address);return;}
    setResendAt(Date.now()+60000);setPhase('verify');setNotice('Confira sua caixa de entrada e a pasta de spam.');
  });
  const verify=()=>void perform(async()=>{
    const recovery=phase==='recovery';
    const {data,error}=await client().auth.verifyOtp({email:accountEmail(email),token:accountCode(code),type:recovery?'recovery':'email'});
    if(error)throw error;if(!data.session)throw new Error('Não foi possível validar o código. Solicite outro.');
    setCode('');if(recovery){recoverySession.current=true;setPhase('password');return;}
    await finish(data.session.user.id,data.session.user.email||email);
  });
  const sendRecovery=()=>void perform(async()=>{
    const address=accountEmail(email);const {error}=await client().auth.resetPasswordForEmail(address);if(error)throw error;
    setEmail(address);setCode('');setResendAt(Date.now()+60000);setPhase('recovery');setNotice('Se houver uma conta com este e-mail, você receberá um código.');
  });
  const resend=()=>void perform(async()=>{
    if(remaining)return;const address=accountEmail(email);
    const {error}=phase==='recovery'?await client().auth.resetPasswordForEmail(address):await client().auth.resend({type:'signup',email:address});
    if(error)throw error;setResendAt(Date.now()+60000);setNotice('Um novo código foi solicitado. Confira seu e-mail.');
  });
  const updatePassword=()=>void perform(async()=>{
    accountPassword(password,confirmation);const {error}=await client().auth.updateUser({password});if(error)throw error;
    const result=await client().auth.signOut({scope:'local'});if(result.error)throw result.error;
    recoverySession.current=false;change('login');setNotice('Senha atualizada. Entre com a nova senha.');
  });
  const titles:Record<Phase,string>={login:'Bem-vindo de volta',register:'Criar sua conta',verify:'Confirme seu e-mail',forgot:'Recuperar acesso',recovery:'Código de recuperação',password:'Crie uma nova senha'};
  return <SafeAreaView style={styles.safe}><KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
    <View style={styles.logo}><Ionicons name="heart" size={40} color="white"/></View><Text style={styles.brand}>Conecta<Text style={{color:blue}}>Solidário</Text></Text>
    <Text style={styles.heading}>Conectando quem doa a quem precisa.</Text><Text style={styles.lead}>Sua conta conecta você a pessoas e ONGs que querem ajudar.</Text>
    <View style={styles.card}><Text style={styles.title}>{titles[phase]}</Text>
      {(phase==='verify'||phase==='recovery')?<><Text style={styles.help}>Digite o código enviado para {email}.</Text><AuthField label="Código recebido por e-mail" value={code} onChange={setCode} kind="code"/><AuthButton label="Confirmar código" onPress={verify} disabled={busy}/><AuthButton label={remaining?`Reenviar em ${remaining}s`:'Reenviar código'} onPress={resend} secondary disabled={busy||remaining>0}/></>:
      phase==='password'?<><Text style={styles.help}>Escolha uma senha com pelo menos 8 caracteres.</Text><AuthField label="Nova senha" kind="password" value={password} onChange={setPassword}/><AuthField label="Confirmar nova senha" kind="password" value={confirmation} onChange={setConfirmation}/><AuthButton label="Salvar nova senha" onPress={updatePassword} disabled={busy}/></>:
      <><Text style={styles.help}>{phase==='register'?'Cadastre seus dados para começar.':phase==='forgot'?'Enviaremos um código para recuperar sua conta.':'Entre com seu e-mail e senha.'}</Text>
        {phase==='register'&&<><AuthField label="Nome ou nome da ONG" value={name} onChange={setName}/><View style={styles.types}>{(['Pessoa física','ONG'] as const).map(value=><Pressable accessibilityRole="radio" accessibilityState={{checked:type===value}} key={value} onPress={()=>setType(value)} style={[styles.type,type===value&&{borderColor:blue,backgroundColor:'#E9F4FF'}]}><Text style={{color:navy,fontWeight:'700'}}>{value}</Text></Pressable>)}</View><AuthField label="WhatsApp com DDD" kind="phone" value={phone} onChange={setPhone} placeholder="(54) 99999-9999"/></>}
        <AuthField label="E-mail" kind="email" value={email} onChange={setEmail} placeholder="seuemail@exemplo.com"/>
        {phase!=='forgot'&&<AuthField label="Senha" kind="password" value={password} onChange={setPassword} placeholder={phase==='register'?'Pelo menos 8 caracteres':'Sua senha'}/>}
        {phase==='register'&&<><AuthField label="Confirmar senha" kind="password" value={confirmation} onChange={setConfirmation}/><Text style={styles.help}>O WhatsApp é obrigatório. Seus contatos serão sugeridos nos seus anúncios; confira o que deseja publicar em cada doação.</Text></>}
        <AuthButton label={phase==='login'?'Entrar':phase==='register'?'Criar conta':'Enviar código'} onPress={phase==='login'?enter:phase==='register'?register:sendRecovery} disabled={busy}/>
      </>}
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}{!!notice&&<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
      {busy&&<ActivityIndicator accessibilityLabel="Processando acesso" color={blue} style={{marginTop:14}}/>}
      {phase==='login'?<><Pressable accessibilityRole="button" disabled={busy} onPress={()=>change('forgot')} style={styles.link}><Text style={styles.linkText}>Esqueci minha senha</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>change('register')} style={styles.link}><Text style={styles.linkText}>Ainda não tenho conta · Cadastrar</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={()=>{try{setEmail(accountEmail(email));change('verify');}catch(e){setError(accountError(e));}}} style={styles.link}><Text style={styles.linkText}>Confirmar meu e-mail</Text></Pressable></>:<Pressable accessibilityRole="button" disabled={busy} onPress={back} style={styles.link}><Text style={styles.linkText}>Voltar para entrar</Text></Pressable>}
    </View><Text style={styles.foot}>Suas contas, doações e fotos ficam sincronizadas entre aparelhos.</Text>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
const styles=StyleSheet.create({
  inputFocus:{borderColor:blue,...(Platform.OS==='web'?{boxShadow:'0 0 0 3px rgba(35,118,201,0.16)'}:{})},
  safe:{flex:1,backgroundColor:'#F5F9FD'},page:{flexGrow:1,padding:24,paddingTop:30,alignItems:'center'},logo:{width:75,height:75,backgroundColor:blue,borderRadius:24,alignItems:'center',justifyContent:'center'},brand:{fontSize:27,fontWeight:'900',color:navy,marginTop:12,letterSpacing:-1},heading:{fontSize:25,lineHeight:32,fontWeight:'900',color:navy,textAlign:'center',marginTop:20},lead:{color:'#708299',fontSize:14,lineHeight:21,textAlign:'center',marginTop:10,marginBottom:24},card:{width:'100%',maxWidth:460,borderRadius:24,borderWidth:1,borderColor:'#E4EBF3',backgroundColor:'white',padding:21},title:{fontSize:21,fontWeight:'800',color:navy},help:{fontSize:13,color:'#708299',lineHeight:20,marginTop:8,marginBottom:18},label:{fontSize:13,fontWeight:'800',color:navy,marginBottom:8},inputRow:{borderWidth:1,borderColor:'#E4EBF3',backgroundColor:'#FAFCFF',borderRadius:13,flexDirection:'row',alignItems:'center',minHeight:52,paddingLeft:13},input:{flex:1,minWidth:0,minHeight:50,paddingLeft:0,paddingVertical:12,paddingRight:12,fontSize:16,lineHeight:24,color:'#1B2E45',includeFontPadding:false,borderWidth:0,backgroundColor:'transparent',...(Platform.OS==='web'?{outlineStyle:'solid' as const,outlineWidth:0}:{})},button:{minHeight:52,backgroundColor:blue,borderRadius:13,alignItems:'center',justifyContent:'center',padding:12,marginTop:6},link:{minHeight:44,alignItems:'center',justifyContent:'center',padding:10},linkText:{color:blue,fontSize:13,fontWeight:'700',textAlign:'center'},error:{color:'#A23636',backgroundColor:'#FFF1F1',padding:12,borderRadius:10,lineHeight:20,marginTop:14},notice:{color:'#218566',backgroundColor:'#E6F6F1',padding:12,borderRadius:10,lineHeight:20,marginTop:14},foot:{fontSize:11,color:'#708299',lineHeight:18,textAlign:'center',marginTop:22},types:{flexDirection:'row',gap:9,marginBottom:18},type:{flex:1,alignItems:'center',padding:13,borderRadius:12,borderWidth:1,borderColor:'#E4EBF3'},
});
