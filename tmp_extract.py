with open('index.HTML', encoding='utf-8') as f:
    for i,line in enumerate(f, 1):
        if 1330 <= i <= 1385:
            print(f'{i}: {line.rstrip()}')
