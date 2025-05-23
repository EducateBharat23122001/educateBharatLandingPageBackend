const express = require('express');
const User = require('../models/userModel')
const Verification = require('../models/verificationModel');
const responseFunction = require('../utils/responseFunction');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
dotenv.config();
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const authTokenHandler = require('../middlewares/checkAuthToken');


const mailer = async (recieveremail, code) => {
    let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        post: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: process.env.COMPANY_EMAIL,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    })


    let info = await transporter.sendMail({
        from: "Team EducateBharat",
        to: recieveremail,
        subject: "OTP for EducateBharat",
        text: "Your OTP is " + code,
        html: "<b>Your OTP is " + code + "</b>",

    })

    console.log("Message sent: %s", info.messageId);

    if (info.messageId) {
        return true;
    }
    return false;
}


router.get('/', (req, res) => {
    res.json({
        message: 'Auth route home'
    })
})
router.post('/sendotp', async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return responseFunction(res, 400, "Email is required", null, false)
    }
    try {
        await Verification.deleteMany({ email: email })
        const code = Math.floor(100000 + Math.random() * 900000);

        const isSent = await mailer(email, code);


        const newVerification = new Verification({
            email: email,
            code: code
        })

        await newVerification.save();

        if (!isSent) {
            return responseFunction(res, 500, "Internal server error", null, false)
        }

        return responseFunction(res, 200, "OTP sent successfully", null, true)
    }
    catch (err) {
        return responseFunction(res, 500, "Internal server error", err, false)
    }
    // res.json({
    //     data: email
    // })
})



router.post('/register', async (req, res, next) => {
    const { name, email, password, otp } = req.body;

    if (!name || !email || !password || !otp) {
        return responseFunction(res, 400, 'All fields are required', null, false);
    }

    if (password.length < 6) {
        return responseFunction(res, 400, 'Password should be atleast 6 characters long', null, false);
    }

    let user = await User.findOne({ email: email })

    let verificationQueue = await Verification.findOne({ email: email })

    if (user) {
        return responseFunction(res, 400, 'User already exists', null, false);
    }
    if (!verificationQueue) {

        return responseFunction(res, 400, 'Please send otp first', null, false);
    }

    const isMatch = await bcrypt.compare(otp, verificationQueue.code);
    if (!isMatch) {
        return responseFunction(res, 400, 'Invalid OTP', null, false);
    }


    user = new User({
        name: name,
        email: email,
        password: password,
    })

    await user.save();
    await Verification.deleteOne({ email: email });
    return responseFunction(res, 200, 'registered successfully', null, true);

})

router.post('/login', async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return responseFunction(res, 400, 'Invalid credentials', null, false);
        }
        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {

            return responseFunction(res, 400, 'Invalid credentials', null, false);
        }


        const authToken = jwt.sign({ userId: user._id }, process.env.JWT_SECRET_KEY, { expiresIn: '1d' })
        const refreshToken = jwt.sign({ userId: user._id }, process.env.JWT_REFRESH_SECRET_KEY, { expiresIn: '10d' })

        user.password = undefined;

        res.cookie('authToken', authToken, { httpOnly: true, secure: true, sameSite: 'none' })
        res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'none' })

        return responseFunction(res, 200, 'Logged in successfully', { user, authToken, refreshToken }, true);
    }
    catch (err) {
        return responseFunction(res, 500, 'Internal server error', err, false);
    }
})

router.post('/changepassword', async (req, res, next) => {
    try {
        const { email, otp, password } = req.body;

        if (!email || !otp || !password) {
            return responseFunction(res, 400, 'All fields are required', null, false);
        }

        let user = await User.findOne({ email: email });
        let verificationQueue = await Verification.findOne({ email: email });
        if (!user) {
            return responseFunction(res, 400, "User doesn't  exist", null, false);
        }
        if (!verificationQueue) {

            return responseFunction(res, 400, 'Please send otp first', null, false);
        }
        const isMatch = await bcrypt.compare(otp, verificationQueue.code);
        user.password = password;
        await user.save();
        await Verification.deleteOne({ email: email });
        return responseFunction(res, 200, 'Password changed successfully', null, true);

    }
    catch (err) {
        return responseFunction(res, 500, 'Internal server error', err, false);
    }
});

router.get('/checklogin', authTokenHandler, async (req, res, next) => {
    res.json({
        ok: req.ok,
        message: req.message,
        userId: req.userId
    })
});

router.get('/getuser', authTokenHandler, async (req, res, next) => {
    try {
        const user = await User.findById(req.userId).select('-password');
        if (!user) {
            return responseFunction(res, 400, 'User not found', null, false);
        }
        return responseFunction(res, 200, 'User found', user, true);

    }
    catch (err) {
        return responseFunction(res, 500, 'Internal server error', err, false);
    }
})

// Add this route to your existing authRoutes.js file
router.post('/delete-account-request', authTokenHandler, async (req, res) => {
    try {
        const { userId } = req;
        const user = await User.findById(userId);
        
        if (!user) {
            return responseFunction(res, 404, 'User not found', null, false);
        }

        // Send email to admin about deletion request
        let transporter = nodemailer.createTransport({
            host: "smtp.gmail.com",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
            user: process.env.COMPANY_EMAIL,
            pass: process.env.GMAIL_APP_PASSWORD
        }
        });

        const mailOptions = {
            from: `"Educate Bharat" <${process.env.COMPANY_EMAIL}>`,
            to: `${process.env.COMPANY_EMAIL}`,
            subject: 'Account Deletion Request',
            text: `User ${user.name} (${user.email}) has requested to delete their account.`,
            html: `
                <div>
                    <h2>Account Deletion Request</h2>
                    <p>A user has requested to delete their account:</p>
                    <ul>
                        <li><strong>Name:</strong> ${user.name}</li>
                        <li><strong>Email:</strong> ${user.email}</li>
                        <li><strong>Request Time:</strong> ${new Date().toLocaleString()}</li>
                    </ul>
                    <p>Please take appropriate action.</p>
                </div>
            `
        };

        await transporter.sendMail(mailOptions);

        // Optionally, you could also send a confirmation email to the user
        const userMailOptions = {
            from: `"Educate Bharat" <${process.env.COMPANY_EMAIL}>`,
            to: user.email,
            subject: 'Account Deletion Request Received',
            html: `
                <div>
                    <h2>Your Account Deletion Request</h2>
                    <p>We've received your request to delete your Educate Bharat account.</p>
                    <p>Our team will process your request shortly. If this wasn't you, please contact our support team immediately.</p>
                    <p>Thank you for being part of Educate Bharat.</p>
                </div>
            `
        };

        await transporter.sendMail(userMailOptions);

        return responseFunction(res, 200, 'Account deletion request received. You will receive a confirmation email.', null, true);

    } catch (err) {
        console.error('Error in delete account request:', err);
        return responseFunction(res, 500, 'Internal server error', err, false);
    }
});


router.get('/test', async (req, res) => {
    // let url = await getObjectURL('hakunamatata');
    // let makankaplot = await postObjectURL('hakunamatata',"")
    res.json({
        message: 'Auth route works',
        // url: url
        // makankaplot: makankaplot
    })
})






router.get('/logout', authTokenHandler, async (req, res, next) => {
    res.clearCookie('authToken');
    res.clearCookie('refreshToken');
    res.json({
        ok: true,
        message: 'Logged out successfully'
    })
})
module.exports = router;
