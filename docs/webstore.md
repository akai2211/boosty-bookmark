Привет, Акай! Отличная идея, публикация расширения — важный шаг. В Chrome Web Store правила довольно строгие, особенно в последнее время, так что лучше изучить всё заранее.

Ниже собраны все ключевые официальные ссылки на документацию Google, где подробно расписаны правила, требования и пошаговые инструкции.

---

### Основные правила и политики (Что можно и нельзя)

* **Политика программы для разработчиков:**
[Developer Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
Это самый главный документ. Здесь собраны все запреты и требования: от недопустимого контента (спам, вредоносное ПО, нарушение авторских прав) до правил использования персональных данных.
* **Требования к конфиденциальности и использованию данных:**
[User Data Privacy](https://www.google.com/search?q=https://developer.chrome.com/docs/webstore/user-data-faq)
У Google очень жесткий аудит в плане безопасности. В этом FAQ подробно описано, как правильно запрашивать разрешения (permissions) в манифесте по принципу «минимальных привилегий» и как заполнять вкладку Privacy в личном кабинете.

---

### Пошаговое руководство по публикации

* **Руководство по публикации (Publishing Tutorial):**
[Publish a Chrome Web Store item](https://developer.chrome.com/docs/webstore/publish)
Пошаговый гайд: как зарегистрировать аккаунт разработчика (это стоит единоразово $5), как упаковать расширение в ZIP-архив и загрузить его в консоль.
* **Подготовка графических материалов:**
[Supplying Images](https://developer.chrome.com/docs/webstore/images)
Здесь описаны четкие требования к иконкам, скриншотам и промо-баннерам (размеры, форматы, соотношение сторон), без которых расширение просто не пропустят на модерацию.

---

### Технические требования (Manifest V3)

Так как ты публикуешь расширение сейчас, оно обязательно должно соответствовать современному стандарту **Manifest V3**.

* **Обзор Manifest V3:**
[Manifest V3 overview](https://www.google.com/search?q=https://developer.chrome.com/docs/extensions/develop/migrate/mv3-overview)
Основные отличия и требования к архитектуре современных расширений.
* **Чек-лист перед отправкой:**
[Prepare your extension for publication](https://www.google.com/search?q=https://developer.chrome.com/docs/webstore/prepare-submission)
Технический чек-лист, чтобы убедиться, что код готов к проверке автоматическими тестами Google.

---

> 💡 **Маленький совет:** Обрати особое внимание на раздел **Single Purpose Policy** (в политиках программы). Расширение должно выполнять *одну* четко выраженную функцию. Если комбайн умеет делать сразу всё, модераторы могут его отклонить и попросить разбить на несколько мелких плагинов.

Если во время сборки ZIP-архива или настройки манифеста возникнут вопросы по ошибкам — пиши, разберемся!


Google Chrome (Chrome Web Store):

    Политика программы: [https://developer.chrome.com/docs/webstore/program-policies](https://developer.chrome.com/docs/webstore/program-policies)

    Конфиденциальность данных: [https://developer.chrome.com/docs/webstore/user-data-faq](https://developer.chrome.com/docs/webstore/user-data-faq)

    Инструкция по публикации: [https://developer.chrome.com/docs/webstore/publish](https://developer.chrome.com/docs/webstore/publish)

    Требования к графике: [https://developer.chrome.com/docs/webstore/images](https://developer.chrome.com/docs/webstore/images)

    Обзор Manifest V3: [https://developer.chrome.com/docs/extensions/develop/migrate/mv3-overview](https://developer.chrome.com/docs/extensions/develop/migrate/mv3-overview)

    Чек-лист перед отправкой: [https://developer.chrome.com/docs/webstore/prepare-submission](https://developer.chrome.com/docs/webstore/prepare-submission)

Mozilla Firefox (AMO):

    Правила для разработчиков: [https://extensionworkshop.com/documentation/publish/add-on-policies/](https://extensionworkshop.com/documentation/publish/add-on-policies/)

    Требования к исходному коду: [https://extensionworkshop.com/documentation/publish/source-code-submission/](https://extensionworkshop.com/documentation/publish/source-code-submission/)

    Инструкция по отправке: [https://extensionworkshop.com/documentation/publish/submitting-an-add-on/](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)

    Оформление карточки: [https://extensionworkshop.com/documentation/publish/create-an-appealing-listing/](https://extensionworkshop.com/documentation/publish/create-an-appealing-listing/)

    Перенос расширения из Chrome: [https://extensionworkshop.com/documentation/develop/porting-an-extension-from-chrome/](https://extensionworkshop.com/documentation/develop/porting-an-extension-from-chrome/)

    Валидатор кода (Linter): [https://extensionworkshop.com/documentation/develop/web-extensions-linter/](https://extensionworkshop.com/documentation/develop/web-extensions-linter/)