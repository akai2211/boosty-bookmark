import os
from PIL import Image, ImageDraw

def create_gradient_image(size, color1, color2):
    """Создает диагональный градиентный фон"""
    img = Image.new("RGBA", (size, size))
    for y in range(size):
        for x in range(size):
            # Коэффициент интерполяции по диагонали
            t = (x + y) / (2.0 * (size - 1)) if size > 1 else 0
            
            r = int(color1[0] + (color2[0] - color1[0]) * t)
            g = int(color1[1] + (color2[1] - color1[1]) * t)
            b = int(color1[2] + (color2[2] - color1[2]) * t)
            a = int(color1[3] + (color2[3] - color1[3]) * t)
            
            img.putpixel((x, y), (r, g, b, a))
    return img

def create_icon(size):
    # Коэффициент масштабирования
    scale = size / 100.0
    
    # 1. Создаем градиентный фон (от оранжевого к более темному оранжевому)
    # Цвета: #FF7A00 -> #FF5C00
    color1 = (255, 122, 0, 255)
    color2 = (255, 92, 0, 255)
    gradient_bg = create_gradient_image(size, color1, color2)
    
    # 2. Создаем маску для скругленного квадрата (основы иконки)
    icon_mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(icon_mask)
    # Радиус скругления около 22%
    radius = int(size * 0.22)
    mask_draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    
    # Применяем маску к фону
    final_bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final_bg.paste(gradient_bg, (0, 0), icon_mask)
    
    # 3. Создаем маску для белой закладки с вырезанной молнией
    bookmark_mask = Image.new("L", (size, size), 0)
    b_draw = ImageDraw.Draw(bookmark_mask)
    
    # Координаты закладки
    left = 32 * scale
    right = 68 * scale
    top = 18 * scale
    bottom = 80 * scale
    top_radius = 4 * scale
    
    # Рендерим закладку по частям
    # Верхняя скругленная часть
    b_draw.rounded_rectangle([left, top, right, 60 * scale], radius=int(top_radius), fill=255)
    # Нижнее прямоугольное продолжение
    b_draw.rectangle([left, 60 * scale - top_radius, right, bottom], fill=255)
    # Вычитаем треугольный вырез снизу
    b_draw.polygon([
        (left, bottom + 1),
        (50 * scale, 67 * scale),
        (right, bottom + 1)
    ], fill=0)
    
    # Вычитаем молнию из закладки
    lightning_points = [
        (47 * scale, 24 * scale),
        (57 * scale, 24 * scale),
        (41 * scale, 48 * scale),
        (49 * scale, 48 * scale),
        (44 * scale, 76 * scale),
        (59 * scale, 46 * scale),
        (51 * scale, 46 * scale)
    ]
    b_draw.polygon(lightning_points, fill=0)
    
    # Создаем изображение белой закладки
    white_bookmark = Image.new("RGBA", (size, size), (255, 255, 255, 255))
    
    # Накладываем закладку на подготовленный фон
    final_icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    final_icon.paste(final_bg, (0, 0))
    final_icon.paste(white_bookmark, (0, 0), bookmark_mask)
    
    # Сохраняем файл
    filename = f"icon{size}.png"
    final_icon.save(filename, "PNG")
    print(f"Сгенерирована иконка: {filename} ({size}x{size})")

if __name__ == "__main__":
    # Создаем папку icons, если ее нет
    os.makedirs("icons", exist_ok=True)
    os.chdir("icons")
    
    # Генерация иконок для расширения Chrome
    create_icon(16)
    create_icon(48)
    create_icon(128)
    print("Все иконки успешно сгенерированы!")
