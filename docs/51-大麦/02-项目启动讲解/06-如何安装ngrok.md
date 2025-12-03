---
slug: /damai/getting-started/install-ngrok
---

# 如何安装ngrok
## 1 输入地址
[👉 点击查看：ngrok | Unified Application Delivery Platform for Developers](https://ngrok.com/)

## 2 点击 Get ngrok
![](/img/damai/安装ngrok/2.png)

## 3 选择下载平台，我选择的是windows
![](/img/damai/安装ngrok/3.png)

## 4 下载后得到压缩文件，然后进行解压，得到ngrok.exe文件
![](/img/damai/安装ngrok/4-1.png)

![](/img/damai/安装ngrok/4-2.png)

## 5 启动该文件
![](/img/damai/安装ngrok/5.png)

## 6 接下来需要注册一个ngrok的账号来获取属于你的密钥
![](/img/damai/安装ngrok/6-1.png)

可以使用你的github账号登录

![](/img/damai/安装ngrok/6-2.png)

## 7 获取到秘钥
![](/img/damai/安装ngrok/7.png)

## 8 执行命令
```shell
ngrok config add-authtoken xxxxx
```
xxxx 替换成你自己的秘钥

## 9 创建配置文件ngrok.yml
执行成功后，命令行界面中会出现下面的信息。此时，代表配置成功。ngrok程序已经在你的用户目录下，创建一个.ngrok2文件夹，并在文件夹中创建一个配置文件ngrok.yml
![](/img/damai/安装ngrok/9.png)

## 10 本地端口映射到外网
在命令行界面中，执行下面命令，即将本地端口映射到外网中，我这里映射的是 6085，如果需要映射其他端口，只需改成相对应的端口即可
```shell
ngrok http 6085
```

## 11 启动成功
执行后会出现映射后的页面，说明启动成功

该程序需一直保持运行，程序关闭，映射也将关闭。如果需要关闭映射，可以使用ctrl + c 或关闭该界面，进行程序终止。每次重新执行命令，映射外网的域名都会发生改变。如果希望域名不变，可通过开通ngrok的会员服务，具体可在官网进行查看

![](/img/damai/安装ngrok/11.png)
