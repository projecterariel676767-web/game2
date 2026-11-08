import React from 'react';
export default function WorldView({url}:{url:string}) {
  return React.createElement('iframe' as any,{src:url,title:'Pin Drive Cesium World',style:{width:'100%',height:'100%',border:0,background:'#07121d'}});
}
