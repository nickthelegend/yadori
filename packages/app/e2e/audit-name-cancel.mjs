export default async function({frame}){await frame.locator('#y-name-cancel').click();const cancelled=await frame.locator('#y-name').count()===0;return {cancelled,reopened:false};}
