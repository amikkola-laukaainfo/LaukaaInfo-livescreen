import sys

def fix_palvelu():
    try:
        with open('palvelu.html', 'r', encoding='utf-8') as f:
            lines = f.readlines()
        
        part1 = lines[:627]
        part2 = lines[788:1307]
        part3 = lines[1570:]
        
        with open('ismatch_new.js', 'r', encoding='utf-8') as f:
            new_ismatch = f.read()
            
        with open('palvelu.html', 'w', encoding='utf-8', newline='') as f:
            f.writelines(part1)
            f.write(new_ismatch + '\n')
            f.writelines(part2)
            f.writelines(part3)
        print("Successfully updated palvelu.html")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_palvelu()
