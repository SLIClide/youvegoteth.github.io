function validateEmail(email) {
    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

function isNumeric(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function advancedToggle(){
    $('advanced_toggle').style.display = 'none';
    $('advanced').style.display = 'block';
}

var unPackAddresses = function(){
    var addresses = JSON.parse(localStorage.getItem("addresses"));
    document.addresses = addresses;
    if(!addresses || addresses.length == 0){
        _alert("Invalid addresss generated.  Please try again from the landing page.");
        setTimeout(function(){
            if(document.location.href.indexOf('send.html') != -1){
                document.location.href = '/';
            }
        },3000);
    };
    localStorage.setItem("addresses", null);
}

window.onload = function () {

    unPackAddresses();

    var min_send_amt_wei = 6000000;

    tokens.forEach(function(ele){
        var option = document.createElement("option");
        option.text = ele.name;
        option.value = ele.addr;
        $("token").add(option);
    });

    // When 'Generate Account' is clicked
    $("send").onclick = function() {
        if(metaMaskWarning()){
            return;
        }
        //setup
        var fromAccount = web3.eth.accounts[0];

        //get form data
        var email = $("email").value;
        var _disableDeveloperTip = !$("tip").checked;
        var accept_tos = $("tos").checked;
        var token = $("token").value;
        var fees = parseInt($("fees").value);
        var expires = parseInt($("expires").value);
        var isSendingETH = (token == '0x0' || token == '0x0000000000000000000000000000000000000000');
        var tokenDetails = tokenAddressToDetails(token);
        var tokenName = 'ETH';
        var weiConvert = weiPerEther;
        if(!isSendingETH){
            tokenName = tokenDetails.name;
            weiConvert = 10**tokenDetails.decimals;
        }
        var amount = $("amount").value * weiConvert;
        var amountInEth = amount * 1.0 / weiConvert;

        //validation
        var hasEmail = email != '';
        if(hasEmail && !validateEmail(email)){
            _alert('Email is optional, but if you enter an email, you must enter a valid email!');
            return;
        }
        if(!isNumeric(amount) || amount == 0){
            _alert('You must enter an number for the amount!');
            return;
        }
        var min_amount = min_send_amt_wei*1.0/weiConvert;
        var max_amount = 5;
        if(!isSendingETH){
            max_amount = 1000;
        }
        if(amountInEth > max_amount){
            _alert('You can only send a maximum of ' + max_amount + ' '+tokenName+'.');
            return;
        }
        if(amountInEth < min_amount){
            _alert('You can minimum of' + min_amount + ' '+tokenName+'.');
            return;
        }

        if(!accept_tos){
            _alert('You must accept the terms.');
            return;
        }

        var numBatches = document.addresses.length;
        var plural = numBatches > 1 ? 's' : '';
        var processTx = function(i){
            //generate ephemeral account
            var _owner = '0x' + lightwallet.keystore._computeAddressFromPrivKey(document.addresses[i].pk);
            var _private_key = document.addresses[i]['pk'];

            //set up callback for web3 call to final transfer
            var final_callback = function(error, result){
                if(error){
                    console.log(error);
                    _alert('got an error :(');
                } else {
                    var txid = result;
                    $("send_eth").style.display = 'none';
                    $("tokenName").innerHTML = tokenName;
                    $("send_eth_done").style.display = 'block';
                    $("trans_link").href = "https://"+etherscanDomain+"/tx/" + result;
                    var relative_link = "r.html?n=" + network_id+ "&c=" + contract_revision + "&key=" + _private_key ;
                    var base_url = document.location.href.split('?')[0].replace('send.html','').replace('#','');
                    var link = base_url + relative_link;
                    $('link').value = link;

                    $('link').style.display='none';
                    var new_link = $('link').cloneNode(true);
                    new_link.id = 'link_'+txid;
                    new_link.style.display='block';
                    $("link_container").appendChild(new_link);

                    var warning = getWarning();
                    if(hasEmail){
                        $("continue").href="mailto:"+email+"?subject=You've Got "+warning+" "+tokenName+"!&body=I've just sent you "+tokenName+".  Click here to claim it: " + encodeURIComponent(link);
                    } else {
                        $("email_container").style.display = "none";
                    }
                    var qrcode_id = 'qrcode_' + txid;
                    var span = document.createElement("span");
                    span.className = 'qr_span';
                    var div = document.createElement("div");
                    div.id = qrcode_id;
                    div.className = 'qrcodes';
                    var p = document.createElement("p");
                    p.className = 'qrcode_header';
                    p.innerHTML = amountInEth + " " + getWarning() + " " + tokenName + "<br>youvegoteth.github.io";


                    $("qrcode_container").appendChild(span);
                    span.appendChild(p);
                    span.appendChild(div);
                    var qrcode = new QRCode(qrcode_id);
                    var qr_content = link;
                    if(false){
                        qr_content = _private_key;
                    }

                    qrcode.makeCode(qr_content);

                    if((i + 1) < numBatches){
                        processTx(i+1);
                    }
                }
            };

            //set up callback for web3 call to erc20 callback
            var erc20_callback = function(error, result){
                if(error){
                    console.log(error);
                    _alert('got an error :(');
                } else {
                    var approve_amount = amount * numBatches;
                    token_contract(token).approve.estimateGas(contract_address, approve_amount, function(error, result){
                        var _gas = result;
                        if (_gas > maxGas){
                            _gas = maxGas;
                        }
                        var _gasLimit = _gas * 1.01;
                        token_contract(token).approve.sendTransaction(
                            contract_address, 
                            approve_amount, 
                            {from :fromAccount, gas:gas, gasLimit: gasLimit},
                            final_callback);
                    });
                }
            };


            //send transfer to web3
            var next_callback = null;
            var amountETHToSend = null;
            if(isSendingETH){
                next_callback = final_callback;
                amountETHToSend = amount + fees;
            } else {
                amountETHToSend = min_send_amt_wei + fees;
                if(i==0){ //only need to call approve once for amount * numbatches
                    next_callback = erc20_callback;
                } else {
                    next_callback = final_callback;
                }
            }
            contract().newTransfer.estimateGas(_disableDeveloperTip, _owner, token, amount, fees, expires, function(error, result){
                var _gas = result;
                if (_gas > maxGas){
                    _gas = maxGas;
                }
                var _gasLimit = _gas * 1.01;
                contract().newTransfer.sendTransaction(
                    _disableDeveloperTip,
                    _owner,
                    token,
                    amount,
                    fees,
                    expires,
                    {from :fromAccount,
                        gas: _gas,
                        value: amountETHToSend,
                        gasLimit: _gasLimit},
                next_callback);
            });
        };
        processTx(0);
    };

};
