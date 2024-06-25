const puppeteer = require("puppeteer");
const fs = require("fs");
const hbs = require("handlebars");
const path = require("path");
const companyController = require("../controllers/companyController");
const catchAsync = require("../utils/catchAsync");
const Company = require("../models/companyModel");
const { Readable } = require("stream");
const { format } = require("date-fns");
const getCommonTags = require("../utils/getCommonTags");

const NUM_TAGS_TO_DISPLAY = 7;

const compile = async function (templateName, data) {
    const filePath = path.join(process.cwd(), "public", `${templateName}.hbs`);
    const html = await fs.readFileSync(filePath, "utf8");

    return hbs.compile(html)(data);
};

exports.generatePdf = catchAsync(async (req, res, next) => {
    const companies = await Company.find({ owner: req.user._id });
    const companiesArray = companies.map(company => company.toObject());
    const topClickedCompanyDocuments = await Company.find({})
        .sort({
            amountClicked: -1,
        })
        .limit(5);
    const topClickedCompanyNames = topClickedCompanyDocuments.map(c => c.name);
    const topClickedCompanyClicks = topClickedCompanyDocuments.map(
        c => c.amountClicked
    );

    const body = req.body;

    const tags = getCommonTags(companiesArray, NUM_TAGS_TO_DISPLAY);

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const data = {
        tagLabels: Array.from(tags.keys()),
        tagData: Array.from(tags.values()),
        topClickedCompanyNames,
        topClickedCompanyClicks,
        companies: companiesArray,
        formattedDate: format(new Date(), "MMMM do, yyyy"),
        ...req.body,
    };

    const content = await compile("reportTemplate", data);

    await page.setContent(content);

    const buffer = await page.pdf({
        format: "A4",
        printBackground: true,
    });
    await browser.close();

    const stream = Readable.from(buffer);

    res.setHeader("Content-Length", buffer.length);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=quote.pdf");
    stream.pipe(res);
});

const getCommonTags = async function (companyData) {
    let tags = new Map();

    for (const company of companyData) {
        for (const tag of company.type) {
            if (tags.get(tag) == undefined) {
                tags.set(tag, 1);
            } else {
                tags.set(tag, tags.get(tag) + 1);
            }
        }
    }

    const tagsArray = Array.from(tags.entries());
    tagsArray.sort((a, b) => b[1] - a[1]);
    const top5Tags = new Map(tagsArray.slice(0, NUM_TAGS_TO_DISPLAY));

    return top5Tags;
};
