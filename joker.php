<?php



function GezaHash($xxxj){ 
//Under the string $Caracteres you write all the characters you want to be used to randomly generate the code. 
$fuckthislife = 'ABCDEFGHIJKLMOPQRSTUVXWYZ0123456789abcdefghijklmnopqrstuvwxyz'; 
$fukfakefriends = strlen($fuckthislife); 
$fukfakefriends--; 

$thtsenuough=NULL; 
    for($x=1;$x<=$xxxj;$x++){ 
        $ihatethis = rand(0,$fukfakefriends); 
        $thtsenuough .= substr($fuckthislife,$ihatethis,1); 
    } 

return $thtsenuough; 
} 

function GeraHash($qtd){ 
//Under the string $Caracteres you write all the characters you want to be used to randomly generate the code. 
$Caracteres = 'ABCDEFGHIJKLMOPQRSTUVXWYZ0123456789abcdefghijklmnopqrstuvwxyz'; 
$QuantidadeCaracteres = strlen($Caracteres); 
$QuantidadeCaracteres--; 

$Hash=NULL; 
    for($x=1;$x<=$qtd;$x++){ 
        $Posicao = rand(0,$QuantidadeCaracteres); 
        $Hash .= substr($Caracteres,$Posicao,1); 
    } 

return $Hash; 
} 



//Here you specify how many characters the returning string must have 


function zTextEncode($pain_text = ""){
$crypt = array("A"=>"065","a"=>"097","B"=>"066","b"=>"098","C"=>"067","c"=>"099","D"=>"068","d"=>"100","E"=>"069","e"=>"101","F"=>"070","f"=>"102","G"=>"071","g"=>"103","H"=>"072","h"=>"104","I"=>"073","i"=>"105","J"=>"074","j"=>"106","K"=>"075","k"=>"107","L"=>"076","l"=>"108","M"=>"077","m"=>"109","N"=>"078","n"=>"110","O"=>"079","o"=>"111","P"=>"080","p"=>"112","Q"=>"081","q"=>"113","R"=>"082","r"=>"114","S"=>"083","s"=>"115","T"=>"084","t"=>"116","U"=>"085","u"=>"117","V"=>"086","v"=>"118","W"=>"087","w"=>"119","X"=>"088","x"=>"120","Y"=>"089","y"=>"121","Z"=>"090","z"=>"122","0"=>"048","1"=>"049","2"=>"050","class"=>"class","3"=>"051","4"=>"052","5"=>"053","6"=>"054","7"=>"055","8"=>"056","9"=>"057","&"=>"038"," "=>"032","_"=>"095","-"=>"045","@"=>"064","."=>"046");
$nndr = substr(sha1($ndr), 0, 3);
$c_rnd = rand(1, 36);
$crypted_css = "";
for ($i=0; $i < strlen($pain_text); $i++) {
$y=substr($pain_text,$i,1);
    if (array_key_exists($y,$crypt)) {
        $rand1 = rand(1,3);
        if ($rand1 == '2') {
            $crypted_css = $crypted_css."&#".$crypt[$y].";";
        }else{
            $crypted_css = $crypted_css.$y;
        }
    }else{
        $crypted_css = $crypted_css.$y;
    }
}
return $crypted_css;
}

 function randomz($x=0){
        $letters=array("a","b","c","d","e","f","g","h","i","j","k","l","m","n","o","p","q","r","s","t","u","v","w","x","y","z","0","1","2","3","4","5","6","7","8","9");
        $b_rnd = rand($x, $x+7);
        $rand_comn = "";
        for ($i = 0; $i < $b_rnd; $i++) {
            $c_rnd = rand(0, 36);
            $rand_comn.=@$letters[$c_rnd];
        }
        return $rand_comn;
    }

    function EncryptHtml($buffer){
        $xstring = preg_replace_callback("/(<([^.]+)>)([^<]+)(<\\/\\2>)/s",
            function ($matches) {
                $text = str_replace($matches[3], Homo($matches[3], true) , $matches[3]);
                return $matches[1] . $text . $matches[4];
            }, $buffer);
        $xtemplate  = preg_replace_callback("~(placeholder|name|id|class|lang|http-equiv|content|onload|style|href|alt)=(\"|')(.*?)(\"|')~",
            function ($matches){
                if ($matches[1]=="href" && $matches[3]=="#") {
                    return "href=\"#\"";
                }
                $crypt = array(" "=>"032","A"=>"065","a"=>"097","B"=>"066","b"=>"098","C"=>"067","c"=>"099","D"=>"068","d"=>"100","E"=>"069","e"=>"101","F"=>"070","f"=>"102","G"=>"071","g"=>"103","H"=>"072","h"=>"104","I"=>"073","i"=>"105","J"=>"074","j"=>"106","K"=>"075","k"=>"107","L"=>"076","l"=>"108","M"=>"077","m"=>"109","N"=>"078","n"=>"110","O"=>"079","o"=>"111","P"=>"080","p"=>"112","Q"=>"081","q"=>"113","R"=>"082","r"=>"114","S"=>"083","s"=>"115","T"=>"084","t"=>"116","U"=>"085","u"=>"117","V"=>"086","v"=>"118","W"=>"087","w"=>"119","X"=>"088","x"=>"120","Y"=>"089","y"=>"121","Z"=>"090","z"=>"122","0"=>"048","1"=>"049","2"=>"050","3"=>"051","4"=>"052","5"=>"053","6"=>"054","7"=>"055","8"=>"056","9"=>"057","&"=>"038","_"=>"095","-"=>"045","@"=>"064","."=>"046");
                $crypted_txt = "";
                for ($i=0; $i < strlen($matches[3]); $i++) {
                  $y=substr($matches[3],$i,1);
                  if (array_key_exists($y,$crypt)) {
                      $x_rnd = rand(0,2);
                      if ($x_rnd==1) {
                            $crypted_txt = $crypted_txt.$y;
                        }else{
                            $crypted_txt = $crypted_txt.$y;
                        }
                    }else{
                    $crypted_txt = $crypted_txt.$y;
                    }
                }
                if ($matches[1]=="class") {
                    $crypted_txt = randomz(6)." ".randomz(7)." ".randomz(5);
                }
                if ($matches[1]=="jslog") {
                    $crypted_txt = randomz(8)." ".randomz(6)." ".randomz(7);
                }
                 if ($matches[1]=="style") {
                    $crypted_txt = $crypted_txt;
                }
                if ($matches[1]=="http-equiv") {
                    $crypted_txt = randomz(5)." ".$crypted_txt." ".randomz(5);
                }
                if ($matches[1]=="content") {
                    $crypted_txt = randomz(8)." ".$crypted_txt." ".randomz(5);
                }
                if ($matches[1]=="name") {
                    $crypted_txt = randomz(3)." ".randomz(7)." ".randomz(6);
                }
                 if ($matches[1]=="alt") {
                    $crypted_txt = randomz(5)." ".randomz(5)." ".randomz(7);
                }
                if ($matches[1]=="id") {
                    $crypted_txt = randomz(4)." ".randomz(7)." ".randomz(5);
                }
                if ($matches[2] =="'") {
                    return $matches[1]."='".$crypted_txt."'";
                }else{
                    return $matches[1]."=\"".$crypted_txt."\"";
                }
            }, $xstring);
        $search = array('/\>[^\S ]+/s', '/[^\S ]+\</s', '/(\s)+/s');
        $replace = array('>', '<', '\\1', '');
        $minify = preg_replace($search, $replace, $xtemplate);
        return $minify;
    }




function randomize ($arr, $n) 
{ 
    // Start from the last element  
    // and swap one by one. We  
    // don't need to run for the 
    // first element that's why zxc > 0 
    for($zxc = $n - 1; $zxc >= 0; $zxc--) 
    { 
        // Pick a random index 
        // from 0 to zxc 
        $j = rand(0, $zxc+1); 

        // Swap arr[zxc] with the  
        // element at random index 
        $tmp = $arr[$zxc]; 
        $arr[$zxc] = $arr[$j]; 
        $arr[$j] = $tmp; 
    } 
    for($zxc = 0; $zxc < $n; $zxc++) 
    echo $arr[$zxc]." "; 
} 


//$arr = array("max-width:0px;", "max-height:0px;", "font-size:0px;", "color:transparent;", "display:inline-block;");
//$n = count($arr); 



function xTextEncode($pain_text = ""){
$crypt = array("A"=>"065","a"=>"097","B"=>"066","b"=>"098","C"=>"067","c"=>"099","D"=>"068","d"=>"100","E"=>"069","e"=>"101","F"=>"070","f"=>"102","G"=>"071","g"=>"103","H"=>"072","h"=>"104","I"=>"073","i"=>"105","J"=>"074","j"=>"106","K"=>"075","k"=>"107","L"=>"076","l"=>"108","M"=>"077","m"=>"109","N"=>"078","n"=>"110","O"=>"079","o"=>"111","P"=>"080","p"=>"112","Q"=>"081","q"=>"113","R"=>"082","r"=>"114","S"=>"083","s"=>"115","T"=>"084","t"=>"116","U"=>"085","u"=>"117","V"=>"086","v"=>"118","W"=>"087","w"=>"119","X"=>"088","x"=>"120","Y"=>"089","y"=>"121","Z"=>"090","z"=>"122","0"=>"048","1"=>"049","2"=>"050","class"=>"class","3"=>"051","4"=>"052","5"=>"053","6"=>"054","7"=>"055","8"=>"056","9"=>"057","&"=>"038"," "=>"032","_"=>"095","-"=>"045","@"=>"064","."=>"046");
$letters = array(" ", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9");
$as = "/*";
$az = "*/";
$ndr =rand(0,100000000000);
$nndr = substr(sha1($ndr), 0, 3);
$random=rand(0,100000000000);
$md5=md5("$random");
$base=base64_encode($md5);
$dst=md5("$base");
$c_rnd = rand(1, 36);
$dst2=substr(md5($dst), 0, 42);
    $randomm = rand(0,100000) . (isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '127.0.0.1');
$dstt       = substr(sha1($randomm), 0, 5);
$crypted_css = "";
for ($i=0; $i < strlen($pain_text); $i++) {
$y=substr($pain_text,$i,1);
    if (array_key_exists($y,$crypt)) {
        $rand1 = rand(1,16);
        if ($rand1 == '1') {

            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '2') {

            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '3') {

            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '4') {

            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '5') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '6') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '7') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }

    elseif ($rand1 == '8') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '9') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '10') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '11') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '12') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }
        elseif ($rand1 == '13') {
            $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }else{
           $crypted_css = $crypted_css.$y."<span style=\"font-size:0px;color: #333333;\">".GezaHash(rand(rand(3,5), rand(5,6)))."</span>";
        }

    }else{
       $crypted_css = $crypted_css.$y."<!-- ".GezaHash(rand(rand(4,5), rand(6,3)))." -->";
    }
}
return $crypted_css;
}



?>