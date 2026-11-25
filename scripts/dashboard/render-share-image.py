from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[2]
site=json.loads((root/'dashboard/src/site.json').read_text(encoding='utf-8'))
image=Image.new('RGB',(1200,630),'#2B2D31');draw=ImageDraw.Draw(image)
fontfile=root/'dashboard/src/assets/fonts/manrope-variable.ttf'
def font(size,weight=500):
    f=ImageFont.truetype(str(fontfile),size)
    try:f.set_variation_by_axes([weight])
    except (ValueError,OSError):pass
    return f
x,y,scale=62,54,1.7
for polygon in [[(5,4),(11,4),(11,21),(28,21),(28,27),(5,27)],[(18,4),(28,4),(28,14),(23,14),(23,9),(18,9)]]:
    draw.polygon([(x+a*scale,y+b*scale) for a,b in polygon],fill='#FFC93C')
draw.text((130,50),site['brand']['name'],font=font(40,600),fill='#F5F5F6')
draw.text((70,166),'Find leads.',font=font(72,650),fill='#F5F5F6')
draw.text((70,256),'Make the next move.',font=font(64,600),fill='#FFC93C')
draw.text((74,362),'Business discovery and outreach, in one workspace.',font=font(26),fill='#D9DADC')
draw.line([(74,448),(1126,448)],fill='#5C626D',width=1)
for pos,text in [(74,'Find businesses'),(434,'Prepare outreach'),(794,'Review and approve')]:
    draw.ellipse((pos,495,pos+8,503),fill='#FFC93C')
    draw.text((pos+24,478),text,font=font(24,550),fill='#F5F5F6')
output=root/'dashboard/public/brand/social-preview.png';output.parent.mkdir(exist_ok=True)
image.save(output,optimize=True)
print('Generated 1200 x 630 social preview from site.json')
